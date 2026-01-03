# WindBorne Balloon Coordinate Visualizer

A Next.js web application for visualizing near-real-time atmospheric balloon coordinate snapshots from the WindBorne “treasure” feed.

This project focuses on reliable ingestion, visualization, and exploration of coordinate-only balloon data from the last 24 hours.

---

## Live Demo

<ADD_DEPLOYED_URL>

---

## Overview

This application fetches and visualizes hourly snapshots of balloon coordinates provided by WindBorne. Each snapshot represents the global positions of many balloons at a given hour in the past, where:

- `00.json` is the most recent snapshot
- `23.json` represents data from 23 hours ago

Users can explore spatial distributions of balloons over time using an interactive map.

---

## Scientific Context

High-altitude balloons can be treated as **Lagrangian tracers**, offering a qualitative view of atmospheric transport and flow organization. Even with coordinate-only data, spatial distributions can provide insight into:

- Large-scale advection patterns
- Regions of dense or sparse observational coverage
- Temporal evolution of balloon placement over the past day

This project intentionally avoids derived meteorological inference and instead emphasizes accurate, transparent visualization of the raw coordinate feed.

---

## Data Source

The application consumes WindBorne “treasure” snapshots hosted at:

https://a.windbornesystems.com/treasure/{HH}.json

Where `{HH}` ranges from `00` (latest) to `23` (23 hours ago).

### Data characteristics

- Each response is a nested list.
- Each inner list represents a single balloon observation.
- Only the values present in the feed are used; no additional atmospheric variables are inferred or synthesized.

Upstream availability, cadence, and format are controlled entirely by WindBorne.

---

## Tech Stack

- **Framework:** Next.js 16
- **Language:** TypeScript
- **UI library:** React 19
- **Map rendering:** Mapbox GL JS (`mapbox-gl`)
- **Styling:** Tailwind CSS
- **Tooling:** ESLint, Prettier, Husky, lint-staged

---

## Core Functionality

- Fetches hourly balloon coordinate snapshots (`00`–`23`)
- Renders balloon positions on an interactive Mapbox map
- Allows selecting and inspecting individual balloon points
- Supports switching between historical hour buckets
- Handles loading and error states when upstream data is unavailable

---
