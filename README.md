# [![English](https://flagcdn.com/w40/gb.png)](#) Shelly Pro 3EM -- Phase-Balanced Energy Calculation

[![Deutsch](https://flagcdn.com/w20/de.png)](#) - siehe weiter unten

## Overview

The **Shelly Pro 3EM** does **not** calculate phase-balanced energy
internally.

If power is imported on one phase while energy is exported on another
phase at the same time, the device increments **both**:

-   `total_energy`
-   `total_energy_returned`

even though the **net power flow is close to zero**.

This behavior is **firmware-related** and identical across:

-   Web UI
-   RPC
-   MQTT
-   Home Assistant
-   Internal scripts

Polling the internal energy counters more frequently does **not**
improve accuracy.

------------------------------------------------------------------------

## Problem

Because Shelly accumulates **absolute per-phase energy**, its internal
counters:

-   cannot represent real net energy flow
-   drift in systems with simultaneous import and export
-   are unsuitable for PV, batteries, or phase-mixed loads

This is a firmware design limitation.

------------------------------------------------------------------------

## Solution

This script implements **true phase-balanced energy measurement** by:

1.  Reading **total active power** (sum of all phases)
2.  Integrating power over **real elapsed time (dt)**
3.  Separating **import and export by sign**
4.  Optionally correcting the integration using Shelly's internal
    counters as a **slow reference**
5.  Storing results in **persisted virtual number components** (Wh)

This mirrors how a real bidirectional energy meter works.

------------------------------------------------------------------------

## How It Works

### Fast loop (every 500 ms by default)

-   Reads `total_act_power` (W)
-   Measures real elapsed time
-   Integrates energy:
    -   Positive power → import
    -   Negative power → export

### Slow loop (≈ once per minute)

-   Detects changes in Shelly internal energy counters
-   Waits until counters are stable for 5 seconds
-   Calculates window deltas:
    -   Integrated energy delta
    -   Shelly energy delta
-   Computes a **correction factor**
-   Applies the factor to the integrated values
-   Updates persistent counters
-   Resets the integration window

All calculations are done in **Wh**, exactly like Shelly.

------------------------------------------------------------------------

## Virtual Components

The script automatically creates:

### Virtual Numbers

-   **Balanced Energy** (Wh)
-   **Balanced Energy Return** (Wh)

### Virtual Group

-   **Energy Balancing**

Both numbers are:

-   persisted across reboots
-   monotonically increasing
-   suitable for Home Assistant energy statistics\
    (via template sensors)

------------------------------------------------------------------------

## Home Assistant Integration

Shelly virtual numbers are **not automatically detected** as energy
sensors.

**Recommended approach**:

Create **template sensors** in Home Assistant that:

-   convert Wh → kWh
-   set:
    -   `device_class: energy`
    -   `state_class: total_increasing`

This makes them usable in the Energy Dashboard.

------------------------------------------------------------------------

## Tested Firmware

-   **Tested with Shelly Pro 3EM firmware 1.7.1**

------------------------------------------------------------------------

## Home Assistant -- Required Helpers (GUI)

For correct processing in **Home Assistant**, you must create **two
Utility Meter helpers**:

-   one for **balanced energy import**
-   one for **balanced energy export**

### Steps

1.  **Settings → Devices & Services → Helpers**
2.  Click **Create Helper**
3.  Select **Utility Meter**
4.  First helper:
    -   **Name**: Balanced Consumption
    -   **Input sensor**: **Net Metered Energy**
    -   **Meter type**: Energy
5.  Second helper:
    -   **Name**: Balanced Feed-in
    -   **Input sensor**: **Net Metered Energy Return**
    -   **Meter type**: Energy

These helpers enable correct statistics and Energy Dashboard support.

------------------------------------------------------------------------

## License

MIT / Public Domain -- use at your own risk.

------------------------------------------------------------------------

# [![Deutsch](https://flagcdn.com/w40/de.png)](#) Shelly Pro 3EM -- Phasen Saldierend

## Überblick

Der **Shelly Pro 3EM** berechnet intern **keine phasen-saldierende
Energie**.

Wenn auf einer Phase Energie bezogen und gleichzeitig auf einer anderen
Phase eingespeist wird, erhöht das Gerät **beide** Zähler:

-   `total_energy`
-   `total_energy_returned`

obwohl die **Nettoleistung nahe null** ist.

Dieses Verhalten ist **firmwarebedingt** und identisch in:

-   Web-UI
-   RPC
-   MQTT
-   Home Assistant
-   internen Skripten

Häufigeres Abfragen der Zähler verbessert die Genauigkeit **nicht**.

------------------------------------------------------------------------

## Problem

Da Shelly die Energie **phasenspezifisch und betragsmäßig** aufsummiert:

-   sind die Zähler nicht nettofähig
-   entsteht Drift bei gleichzeitiger Einspeisung und Bezug
-   sind die Werte für PV-Anlagen physikalisch falsch

Dies ist eine Firmware-Designentscheidung.

------------------------------------------------------------------------

## Lösung

Dieses Skript realisiert eine **physikalisch korrekte,
phasen-balancierte Energieerfassung** durch:

1.  Lesen der **Gesamtwirkleistung**
2.  Integration über die **tatsächlich vergangene Zeit**
3.  Trennung von Bezug und Einspeisung über das Vorzeichen
4.  Optionale Korrektur über Shelly-Zähler als Referenz
5.  Speicherung in **persistenten virtuellen Zählern** (Wh)

------------------------------------------------------------------------

## Getestete Firmware

-   **Getestet mit Shelly Pro 3EM Firmware 1.7.1**

------------------------------------------------------------------------

## Home Assistant -- Erforderliche Helfer (GUI)

1.  **Einstellungen → Geräte & Dienste → Helfer**
2.  **Helfer erstellen**
3.  **Verbrauchszähler** auswählen
4.  Erster Helfer:
    -   **Name**: Saldierender Verbrauch
    -   **Eingangssensor**: **Net Metered Energy**
5.  Zweiter Helfer:
    -   **Name**: Saldierte Einspeisung
    -   **Eingangssensor**: **Net Metered Energy Return**

------------------------------------------------------------------------

## Lizenz

MIT / Public Domain -- Nutzung auf eigene Verantwortung.
