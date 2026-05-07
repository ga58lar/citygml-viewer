# Changelog

## [1.0.1] — 2026-05-07

- Fix empty visualization for CityGML files that use the default namespace instead of the `core:` prefix (e.g. Bayern open data files)

## [1.0.0] — 2026-04-30

- Initial release
- 3D WebGL viewer for CityGML LoD2 `.gml` files
- Surface-type colouring: walls grey, roofs red, ground dark grey
- Orbit / pan / zoom navigation with OrbitControls
- Top-down orthographic view toggle
- Click-to-inspect: building highlight + properties panel showing gml:id and gen:stringAttribute values
- Deselect by clicking same building again or clicking empty space
- Support for buildings with BuildingPart sub-elements
- Support for bridges with BridgePart sub-elements
- Support for tunnels with TunnelPart sub-elements
