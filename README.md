# [![English](https://flagcdn.com/w40/gb.png)](#) Shelly Pro 3EM – Phase-Balanced Energy Calculation
[![Deutsch](https://flagcdn.com/w20/de.png)](#) - siehe weiter unten

## Overview

The **Shelly Pro 3EM** does **not** calculate phase-balanced energy internally.

If power is imported on one phase while energy is exported on another phase at the same time, the device increments **both**:

- `total_energy`
- `total_energy_returned`

even though the **net power flow is close to zero**.

This behavior is **firmware-related** and identical across:

- Web UI
- RPC
- MQTT
- Home Assistant
- Internal scripts

Polling the internal energy counters more frequently does **not** improve accuracy.

---

## Problem

Because Shelly accumulates **absolute per-phase energy**, its internal counters:

- cannot represent real net energy flow
- drift in systems with simultaneous import and export
- are unsuitable for PV, batteries, or phase-mixed loads

This is a firmware design limitation.

---

## Solution

This script implements **true phase-balanced energy measurement** by:

1. Reading **total active power** (sum of all phases)
2. Integrating power over **real elapsed time (dt)**
3. Separating **import and export by sign**
4. Optionally correcting the integration using Shelly’s internal counters as a **slow reference**
5. Storing results in **persisted virtual number components** (Wh)

This mirrors how a real bidirectional energy meter works.

---

## How It Works

### Fast loop (every 500 ms by default)

- Reads `total_act_power` (W)
- Measures real elapsed time
- Integrates energy:
  - Positive power → import
  - Negative power → export

### Slow loop (≈ once per minute)

- Detects changes in Shelly internal energy counters
- Waits until counters are stable for 5 seconds
- Calculates window deltas:
  - Integrated energy delta
  - Shelly energy delta
- Computes a **correction factor**
- Applies the factor to the integrated values
- Updates persistent counters
- Resets the integration window

All calculations are done in **Wh**, exactly like Shelly.

---

## Virtual Components

The script automatically creates:

### Virtual Numbers
- **Balanced Energy** (Wh)
- **Balanced Energy Return** (Wh)

### Virtual Group
- **Energy Balancing**

Both numbers are:

- persisted across reboots
- monotonically increasing
- suitable for Home Assistant energy statistics  
  (via template sensors)

---

## Home Assistant Integration

Shelly virtual numbers are **not automatically detected** as energy sensors.

**Recommended approach**:

Create **template sensors** in Home Assistant that:

- convert Wh → kWh
- set:
  - `device_class: energy`
  - `state_class: total_increasing`

This makes them usable in the Energy Dashboard.

---

## Configuration

At the top of the script:

```js
let INTEGRATION_TICK_MS = 500;
```

You may adjust the integration interval as needed.  
Real elapsed time is always measured, so timing jitter is handled correctly.

---

## Notes

- No per-phase energy values are used
- No smoothing or averaging is applied
- No assumptions about load symmetry are made
- Works with grid, PV, batteries, or mixed systems

---

## License

MIT / Public Domain – use at your own risk.

---

# [![Deutsch](https://flagcdn.com/w40/de.png)](#) Shelly Pro 3EM – Phasen Saldierend

## Überblick

Der **Shelly Pro 3EM** berechnet intern **keine phasen-saldierende Energie**.

Wenn auf einer Phase Energie bezogen und gleichzeitig auf einer anderen Phase eingespeist wird, erhöht das Gerät **beide** Zähler:

- `total_energy`
- `total_energy_returned`

obwohl die **Nettoleistung nahe null** ist.

Dieses Verhalten ist **firmwarebedingt** und identisch in:

- Web-UI
- RPC
- MQTT
- Home Assistant
- internen Skripten

Häufigeres Abfragen der Zähler verbessert die Genauigkeit **nicht**.

---

## Problem

Da Shelly die Energie **phasenspezifisch und betragsmäßig** aufsummiert:

- sind die Zähler nicht nettofähig
- entsteht Drift bei gleichzeitiger Einspeisung und Bezug
- sind die Werte für PV-Anlagen physikalisch falsch

Dies ist eine Firmware-Designentscheidung.

---

## Lösung

Dieses Skript realisiert eine **physikalisch korrekte, phasen-balancierte Energieerfassung** durch:

1. Lesen der **Gesamtwirkleistung** (Summe aller Phasen)
2. Integration der Leistung über die **tatsächlich vergangene Zeit**
3. Trennung von Bezug und Einspeisung über das Vorzeichen
4. Optionale Korrektur über Shelly-Zähler als **langsame Referenz**
5. Speicherung in **persistenten virtuellen Zählern** (Wh)

Das Verhalten entspricht einem realen bidirektionalen Stromzähler.

---

## Funktionsweise

### Schneller Zyklus (standardmäßig alle 500 ms)

- `total_act_power` wird gelesen
- echte Zeitdifferenz wird gemessen
- Energie wird integriert:
  - positive Leistung → Bezug
  - negative Leistung → Einspeisung

### Langsamer Zyklus (≈ einmal pro Minute)

- Änderung der Shelly-Zähler wird erkannt
- 5 Sekunden Stabilität abgewartet
- Fenster-Deltas werden berechnet
- Korrekturfaktor wird ermittelt
- integrierte Werte werden skaliert
- persistente Zähler werden erhöht
- Integrationsfenster wird zurückgesetzt

Alle Berechnungen erfolgen in **Wh**, exakt wie bei Shelly.

---

## Virtuelle Komponenten

Das Skript erstellt automatisch:

### Virtuelle Nummern
- **Balanced Energy** (Wh)
- **Balanced Energy Return** (Wh)

### Virtuelle Gruppe
- **Energy Balancing**

Eigenschaften:

- reboot-fest
- monoton steigend
- geeignet für Home-Assistant-Statistiken  
  (über Template-Sensoren)

---

## Home Assistant

Virtuelle Shelly-Nummern werden **nicht automatisch** als Energiezähler erkannt.

**Empfohlene Lösung**:

In Home Assistant **Template-Sensoren** anlegen mit:

- Umrechnung Wh → kWh
- `device_class: energy`
- `state_class: total_increasing`

Damit sind sie vollständig kompatibel mit dem Energie-Dashboard.

---

## Konfiguration

Im Header des Skripts:

```js
let INTEGRATION_TICK_MS = 500;
```

Das Intervall kann angepasst werden.  
Die Integration nutzt immer die **echte Zeitdifferenz**, nicht das Soll-Intervall.

---

## Hinweise

- Keine Nutzung von Phasen-Energiezählern
- Keine Glättung oder Mittelung
- Keine Annahmen über Lastverteilung
- Geeignet für Netz, PV, Speicher und Mischbetrieb

---

## Lizenz

MIT / Public Domain – Nutzung auf eigene Verantwortung.
