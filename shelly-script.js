/*
================================================================================
PROJECT CONTEXT / CHAT SUMMARY
================================================================================

- Device: Shelly Pro 3EM
- Problem:
  - Shelly does NOT perform proper net metering (phase balancing) across phases.
  - Import on one phase and export on others causes BOTH
    `energy` and `energy_returned` to increase.
  - Internal Shelly energy counters are updated only ~once per minute.
  - This behavior is firmware-related and identical in:
      * Web UI
      * RPC
      * MQTT
      * Home Assistant
      * Internal scripts

- Consequence:
  - Shelly energy counters cannot be used for accurate, phase-netted energy.
  - Polling them faster does NOT improve resolution.

- Correct solution:
  - Read total active power (sum of all phases).
  - Integrate power over real elapsed time (dt).
  - Separate import/export by sign.
  - Optionally align the integration to Shelly totals to prevent drift.

- This script:
  - Integrates total active power every second (real dt).
  - Produces net metered import and export energy values.
  - Stores results in persisted virtual number components (Wh).
  - Uses Shelly totals only as a slow reference for correction.
  - Creates a virtual group "Net Metering" containing the result values.

07.11.2026 - chackl1990
supported generation with AI

================================================================================
*/


// =====================
// User settings (Header)
// =====================

// Integration tick interval in milliseconds.
// real elapsed time (dt) is measured.
let INTEGRATION_TICK_MS = 500;

// EM / EMData component IDs (Shelly Pro 3EM usually uses id = 0)
let EM_ID = 0;
let EMDATA_ID = 0;

// Virtual group
let NET_METERING_GROUP_ID = 200;
let NET_METERING_GROUP_NAME = "Energy Net Metering";

// Virtual number component IDs and names
let NET_METERED_ENERGY_ID = 200;
let NET_METERED_ENERGY_RET_ID = 201;

let NET_METERED_ENERGY_NAME = "Net Metered Energy";
let NET_METERED_ENERGY_RET_NAME = "Net Metered Energy Return";

// Enable or disable debug logging
let LOG = false;


// =====================
// Internal state
// =====================

// Handles to virtual number components
let net_metered_energy_handle = null;
let net_metered_energy_ret_handle = null;

// Persisted total values in Wh (loaded at startup)
let net_metered_energy_wh = 0.0;
let net_metered_energy_ret_wh = 0.0;

// Integrated energy since last correction window (Wh)
let delta_energy_integrate_wh = 0.0;       // Import (positive power)
let delta_energy_ret_integrate_wh = 0.0;   // Export (negative power, absolute)

const ENERGY_EPSILON_WH = 0.001;

// Baseline of Shelly internal energy counters at window start
let baseline_total_energy_wh = null;       // EMData.total_act
let baseline_total_energy_ret_wh = null;   // EMData.total_act_ret

// Last observed Shelly energy counters
let last_seen_total_energy_wh = null;
let last_seen_total_energy_ret_wh = null;

// Change / stability detection for Shelly totals
let totals_changed_since_last_correction = false;
let totals_last_change_uptime_ms = 0;
let last_correction_uptime_ms = 0;

// Timing for power integration
let last_integration_uptime_ms = null;


// =====================
// Helper functions
// =====================

// Conditional logger
function log() {
    if (!LOG) return;
    print.apply(null, arguments);
}

// Numeric sanity check
function isNumber(x) {
    return typeof x === "number" && isFinite(x);
}

// Clamp value into a min/max range
function clampMinMax(value, minValue, maxValue) {
    if (value < minValue) return minValue;
    if (value > maxValue) return maxValue;
    return value;
}

// Get device uptime in milliseconds
function getUptimeMs() {
    return Shelly.getUptimeMs();
}


// =====================
// Virtual components management
// =====================

// Find a component by key in Shelly.GetComponents result
function getComponentByKeyFromList(components, key) {
    for (let i = 0; i < components.length; i++) {
        if (components[i].key === key) return components[i];
    }
    return null;
}

// Ensure a persisted virtual number component exists with correct name
function ensureVirtualNumberComponent(id, expectedName, callback /* (ok:boolean) */) {
    let key = "number:" + id;

    Shelly.call(
        "Shelly.GetComponents",
        { dynamic_only: true, include: ["config"] },
        function (result) {
            let components = (result && result.components) ? result.components : [];
            let existing = getComponentByKeyFromList(components, key);

            function createNew() {
                Shelly.call(
                    "Virtual.Add",
                    {
                        type: "number",
                        id: id,
                        config: {
                            name: expectedName,
                            persisted: true,
                            meta: {
                                ui: {
                                    view: "label",
                                    unit: "Wh",
                                    step: 1
                                }
                            }
                        }
                    },
                    function (_res, err) {
                        if (err) {
                            log("Virtual.Add failed for", key, "error:", JSON.stringify(err));
                            callback(false);
                            return;
                        }
                        callback(true);
                    }
                );
            }

            if (!existing) {
                createNew();
                return;
            }

            let existingName = existing.config ? existing.config.name : null;
            if (existingName !== expectedName) {
                log("Component", key, "exists but name differs:", existingName, "-> recreating");
                Shelly.call("Virtual.Delete", { key: key }, function () {
                    createNew();
                });
                return;
            }

            callback(true);
        }
    );
}

// Ensure a virtual group exists, has the correct name, and contains members
function ensureVirtualGroupComponent(id, expectedName, memberKeys, callback /* (ok:boolean) */) {
    let key = "group:" + id;

    Shelly.call(
        "Shelly.GetComponents",
        { dynamic_only: true, include: ["config"] },
        function (result) {
            let components = (result && result.components) ? result.components : [];
            let existing = getComponentByKeyFromList(components, key);

            function configureGroup() {
                Shelly.call(
                    "Group.SetConfig",
                    { id: id, config: { name: expectedName } },
                    function () {
                        Shelly.call(
                            "Group.Set",
                            { id: id, value: memberKeys },
                            function () {
                                callback(true);
                            }
                        );
                    }
                );
            }

            function createNew() {
                Shelly.call(
                    "Virtual.Add",
                    { type: "group", id: id, config: { name: expectedName } },
                    function () {
                        configureGroup();
                    }
                );
            }

            if (!existing) {
                createNew();
                return;
            }

            let existingName = existing.config ? existing.config.name : null;
            if (existingName !== expectedName) {
                log("Group", key, "exists but name differs:", existingName, "-> recreating");
                Shelly.call("Virtual.Delete", { key: key }, function () {
                    createNew();
                });
                return;
            }

            configureGroup();
        }
    );
}


// =====================
// Shelly readings
// =====================

// Read total active power (sum of all phases), in Watts
function readTotalPowerW() {
    let em_status = Shelly.getComponentStatus("em", EM_ID);
    if (!em_status || !isNumber(em_status.total_act_power)) return null;
    return em_status.total_act_power;
}

// Read Shelly internal energy counters (Wh)
function readTotalsWh() {
    let emdata_status = Shelly.getComponentStatus("emdata", EMDATA_ID);
    if (!emdata_status) return null;

    if (!isNumber(emdata_status.total_act) || !isNumber(emdata_status.total_act_ret)) return null;

    return {
        total_energy_wh: emdata_status.total_act,
        total_energy_ret_wh: emdata_status.total_act_ret
    };
}


// =====================
// Integration & correction logic
// =====================

// Integrate power using real elapsed time
function integratePower() {
    let now_ms = getUptimeMs();

    if (last_integration_uptime_ms === null) {
        last_integration_uptime_ms = now_ms;
        return;
    }

    let dt_ms = now_ms - last_integration_uptime_ms;
    if (dt_ms <= 0) return;

    last_integration_uptime_ms = now_ms;

    let power_w = readTotalPowerW();
    if (!isNumber(power_w)) return;

    let energy_wh = power_w * (dt_ms / 3600000.0);

    if (energy_wh >= 0) {
        delta_energy_integrate_wh += energy_wh;
    } else {
        delta_energy_ret_integrate_wh += -energy_wh;
    }
}

// Initialize baseline at the start of a correction window
function startNewWindowBaselineIfNeeded(total_energy_wh, total_energy_ret_wh) {
    if (!isNumber(baseline_total_energy_wh) || !isNumber(baseline_total_energy_ret_wh)) {
        baseline_total_energy_wh = total_energy_wh;
        baseline_total_energy_ret_wh = total_energy_ret_wh;

        last_seen_total_energy_wh = total_energy_wh;
        last_seen_total_energy_ret_wh = total_energy_ret_wh;

        totals_changed_since_last_correction = false;
        totals_last_change_uptime_ms = getUptimeMs();
        last_correction_uptime_ms = getUptimeMs();

        delta_energy_integrate_wh = 0.0;
        delta_energy_ret_integrate_wh = 0.0;

        log("Baseline initialized:",
            "baseline_total_energy_wh =", baseline_total_energy_wh,
            "baseline_total_energy_ret_wh =", baseline_total_energy_ret_wh
        );
    }
}

// Detect changes in Shelly totals (they update ~once/minute)
function updateChangeDetection(total_energy_wh, total_energy_ret_wh) {
    if (!isNumber(last_seen_total_energy_wh) || !isNumber(last_seen_total_energy_ret_wh)) {
        last_seen_total_energy_wh = total_energy_wh;
        last_seen_total_energy_ret_wh = total_energy_ret_wh;
        return;
    }

    if (total_energy_wh !== last_seen_total_energy_wh || total_energy_ret_wh !== last_seen_total_energy_ret_wh) {
        totals_changed_since_last_correction = true;
        totals_last_change_uptime_ms = getUptimeMs();

        last_seen_total_energy_wh = total_energy_wh;
        last_seen_total_energy_ret_wh = total_energy_ret_wh;
    }
}

// Apply correction once totals are stable for 5 seconds
function applyCorrectionIfReady(total_energy_wh, total_energy_ret_wh) {
    if (!totals_changed_since_last_correction) return;

    let now_ms = getUptimeMs();

    // wait until totals are stable for 5 seconds
    if ((now_ms - totals_last_change_uptime_ms) < 5000) return;

    let delta_total_energy_wh = total_energy_wh - baseline_total_energy_wh;
    let delta_total_energy_ret_wh = total_energy_ret_wh - baseline_total_energy_ret_wh;

    // Renamed: show delta_energy_sum (window delta), not total_energy_sum
    let delta_energy_sum = delta_total_energy_wh - delta_total_energy_ret_wh;

    // This is already the window delta (integration resets to 0 each window)
    let delta_energy_integrate_sum =
        delta_energy_integrate_wh - delta_energy_ret_integrate_wh;

    let correction_factor = 1.0;
    if (isNumber(delta_energy_integrate_sum) && Math.abs(delta_energy_integrate_sum) > ENERGY_EPSILON_WH) {
        correction_factor = delta_energy_sum / delta_energy_integrate_sum;

        if (!isNumber(correction_factor)) correction_factor = 1.0;
        if (correction_factor <= 0.001) correction_factor = 1.0;
    } else {
        // no meaningful integration -> do not distort
        correction_factor = 1.0;
    }

    // If you do NOT want any clamping, comment out this line.
    // Conservative sanity clamp against single-tick spikes / counter resets.
    correction_factor = clampMinMax(correction_factor, 0.1, 10.0);

    let delta_energy_integrate_corrected =
        delta_energy_integrate_wh * correction_factor;

    let delta_energy_ret_integrate_corrected =
        delta_energy_ret_integrate_wh * correction_factor;

    net_metered_energy_wh += delta_energy_integrate_corrected;
    net_metered_energy_ret_wh += delta_energy_ret_integrate_corrected;

    // Persist to virtual numbers (Wh)
    if (net_metered_energy_handle) net_metered_energy_handle.setValue(net_metered_energy_wh);
    if (net_metered_energy_ret_handle) net_metered_energy_ret_handle.setValue(net_metered_energy_ret_wh);

    // Updated logging: show only window deltas + correction factor + corrected deltas
    log("Correction applied:",
        "correction_factor =", correction_factor,
        "delta_energy_sum =", delta_energy_sum,
        "delta_energy_integrate_sum =", delta_energy_integrate_sum,
        "delta_energy_integrate_corrected =", delta_energy_integrate_corrected,
        "delta_energy_ret_integrate_corrected =", delta_energy_ret_integrate_corrected
    );

    // Start next window
    baseline_total_energy_wh = total_energy_wh;
    baseline_total_energy_ret_wh = total_energy_ret_wh;

    delta_energy_integrate_wh = 0.0;
    delta_energy_ret_integrate_wh = 0.0;

    totals_changed_since_last_correction = false;
    last_correction_uptime_ms = now_ms;

    // reset integration time anchor to avoid a large dt after "window close"
    last_integration_uptime_ms = now_ms;
}


// =====================
// Main loop
// =====================

function tick() {
    // Always integrate power
    integratePower();

    // Totals logic + correction
    let totals = readTotalsWh();
    if (!totals) return;

    startNewWindowBaselineIfNeeded(totals.total_energy_wh, totals.total_energy_ret_wh);
    updateChangeDetection(totals.total_energy_wh, totals.total_energy_ret_wh);
    applyCorrectionIfReady(totals.total_energy_wh, totals.total_energy_ret_wh);
}


// =====================
// Startup sequence
// =====================

function loadPersistedNetMeteredValuesFromVirtualComponents() {
    net_metered_energy_handle = Virtual.getHandle("number:" + NET_METERED_ENERGY_ID);
    net_metered_energy_ret_handle = Virtual.getHandle("number:" + NET_METERED_ENERGY_RET_ID);

    let s1 = net_metered_energy_handle ? net_metered_energy_handle.getStatus() : null;
    let s2 = net_metered_energy_ret_handle ? net_metered_energy_ret_handle.getStatus() : null;

    net_metered_energy_wh = (s1 && isNumber(s1.value)) ? s1.value : 0.0;
    net_metered_energy_ret_wh = (s2 && isNumber(s2.value)) ? s2.value : 0.0;

    log("Startup values loaded:",
        "net_metered_energy_wh =", net_metered_energy_wh,
        "net_metered_energy_ret_wh =", net_metered_energy_ret_wh
    );
}

function start() {
    ensureVirtualNumberComponent(NET_METERED_ENERGY_ID, NET_METERED_ENERGY_NAME, function () {
        ensureVirtualNumberComponent(NET_METERED_ENERGY_RET_ID, NET_METERED_ENERGY_RET_NAME, function () {

            ensureVirtualGroupComponent(
                NET_METERING_GROUP_ID,
                NET_METERING_GROUP_NAME,
                [
                    "number:" + NET_METERED_ENERGY_ID,
                    "number:" + NET_METERED_ENERGY_RET_ID
                ],
                function () {
                    // read persisted values now that components exist
                    loadPersistedNetMeteredValuesFromVirtualComponents();

                    // initialize baseline immediately (optional, but helps avoid "first correction" oddities)
                    let totals = readTotalsWh();
                    if (totals) {
                        startNewWindowBaselineIfNeeded(totals.total_energy_wh, totals.total_energy_ret_wh);
                    }

                    Timer.set(INTEGRATION_TICK_MS, true, tick);
                    log("Net metering script started");
                }
            );

        });
    });
}

start();
