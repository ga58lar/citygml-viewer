# Changelog

## [1.1.0] — 2026-05-07

- Add white background toggle
- Add render mode selector: Surface, Wireframe, Surface+Edges
- Fix loading of CityGML files using the default XML namespace instead of the `core:` prefix (e.g. Bayern open data)
- Fix rendering performance for large files: geometry is now merged by material type, reducing GPU draw calls from O(surfaces) to O(materials) regardless of scene size
- Fix loading of large files: parsing now runs in the webview instead of the extension host, eliminating VS Code IPC as a bottleneck

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
