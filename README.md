# [![English](https://flagcdn.com/w40/gb.png)](#) Shelly Pro 3EM -- Net Metering Energy Calculation

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

-   **Net Metered Energy** (Wh)
-   **Net Metered Energy Return** (Wh)

### Virtual Group

-   **Energy Net Metering**

Both numbers are:

-   persisted across reboots
-   monotonically increasing
-   suitable for Home Assistant energy statistics\
    (via template sensors)

------------------------------------------------------------------------

## Tested Firmware

-   **Tested with Shelly Pro 3EM firmware 1.7.1**

------------------------------------------------------------------------

## Home Assistant - Required Helpers (GUI)

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

Der **Shelly Pro 3EM** berechnet **keine phasen‑saldierende Energie**
intern.

Wird auf einer Phase Energie bezogen, während gleichzeitig auf einer
anderen Phase Energie eingespeist wird, erhöht das Gerät **beide**
Zähler:

-   `total_energy`
-   `total_energy_returned`

obwohl der **Netto‑Leistungsfluss nahezu null** ist.

Dieses Verhalten ist **firmwarebedingt** und identisch in:

-   Web‑UI
-   RPC
-   MQTT
-   Home Assistant
-   internen Skripten

Ein häufigeres Abfragen der internen Energiezähler verbessert die
Genauigkeit **nicht**.

------------------------------------------------------------------------

## Problem

Da Shelly **absolute, phasenweise Energie** aufsummiert, können die
internen Zähler:

-   keinen realen Netto‑Energiefluss abbilden
-   in Systemen mit gleichzeitigem Bezug und Einspeisung driften
-   nicht sinnvoll für PV‑Anlagen, Batterien oder phasen­gemischte
    Verbraucher verwendet werden

Dies ist eine **Design‑Einschränkung der Firmware**.

------------------------------------------------------------------------

## Lösung

Dieses Skript implementiert eine **echte phasen‑saldierende
Energie­messung**, indem es:

1.  die **Gesamtwirkleistung** (Summe aller Phasen) ausliest
2.  die Leistung über die **real vergangene Zeit (dt)** integriert
3.  **Bezug und Einspeisung anhand des Vorzeichens** trennt
4.  optional die Integration mit den internen Shelly‑Zählern als
    **langsamer Referenz** korrigiert
5.  die Ergebnisse in **persistenten virtuellen Zahlen‑Komponenten**
    (Wh) speichert

Dies entspricht dem Funktionsprinzip eines echten bidirektionalen
Energiezählers.

------------------------------------------------------------------------

## Funktionsweise

### Schneller Zyklus (standardmäßig alle 500 ms)

-   Liest `total_act_power` (W)
-   Misst die reale verstrichene Zeit
-   Integriert die Energie:
    -   Positive Leistung → Bezug
    -   Negative Leistung → Einspeisung

### Langsamer Zyklus (≈ einmal pro Minute)

-   Erkennt Änderungen der internen Shelly‑Energiezähler
-   Wartet, bis die Zähler 5 Sekunden stabil sind
-   Berechnet Fenster‑Deltas:
    -   integrierte Energieänderung
    -   Shelly‑Energieänderung
-   Ermittelt einen **Korrekturfaktor**
-   Wendet diesen Faktor auf die integrierten Werte an
-   Aktualisiert die persistenten Zähler
-   Setzt das Integrationsfenster zurück

Alle Berechnungen erfolgen in **Wh**, exakt wie bei Shelly.

------------------------------------------------------------------------

## Virtuelle Komponenten

Das Skript erzeugt automatisch:

### Virtuelle Zahlen

-   **Netto gemessene Energie** (Wh)
-   **Netto gemessene Einspeiseenergie** (Wh)

### Virtuelle Gruppe

-   **Energie‑Netto‑Saldierung**

Beide Zahlen sind:

-   über Neustarts hinweg persistent
-   monoton steigend
-   für Home‑Assistant‑Energiestatistiken geeignet    (über Template‑Sensoren)

------------------------------------------------------------------------

## Getestete Firmware

-   **Getestet mit Shelly Pro 3EM Firmware 1.7.1**

------------------------------------------------------------------------

## Home Assistant – Erforderliche Helfer (GUI)

Für die korrekte Verarbeitung in **Home Assistant** müssen **zwei
Utility‑Meter‑Helfer** angelegt werden:

-   einer für **saldierenden Energiebezug**
-   einer für **saldierende Energieeinspeisung**

### Schritte

1.  **Einstellungen → Geräte & Dienste → Helfer**
2.  **Helfer erstellen** anklicken
3.  **Utility Meter** auswählen
4.  Erster Helfer:
    -   **Name**: Saldo Verbrauch
    -   **Eingangssensor**: **Netto gemessene Energie**
    -   **Zählertyp**: Energie
5.  Zweiter Helfer:
    -   **Name**: Saldo Einspeisung
    -   **Eingangssensor**: **Netto gemessene Einspeiseenergie**
    -   **Zählertyp**: Energie

Diese Helfer ermöglichen korrekte Statistiken und die Nutzung im
Energy‑Dashboard.

------------------------------------------------------------------------

## Lizenz

MIT / Public Domain – Nutzung auf eigene Gefahr.
