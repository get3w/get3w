# Third-party software notices

Get3W source is MIT licensed; dependencies and bundled components retain their
own licenses. `NOTICE` preserves the OpenWork and codemode provenance. The
original OpenWork license is retained verbatim in `third-party/openwork/LICENSE`
with its pinned upstream revision in `third-party/openwork/source.json`.

`third-party/runtime-licenses.json` records the installed production closure,
actual staged Electron runtime, bundled engine plugin archive and Electron
framework. Each row includes package/version, declared and selected license,
usage scope and hashes/paths of verbatim license texts. The production closure
is conservative: it can include tooling/type-only packages that do not execute
in the final product. Actual ASAR content is validated separately.

Where a package declares a permissive SPDX license but omits a separate text,
the record explicitly identifies that limitation; no author or copyright is
invented. See the package manifest/source provenance in the inventory. Original
package notices and upstream notices retrieved at a pinned revision are retained
in `third-party/license-texts/`.

For dual-licensed dependencies this distribution selects Apache-2.0 for
DOMPurify, BSD-3-Clause for json-schema, and MIT for type-fest. Apache packages
retain their LICENSE/NOTICE files; Get3W modifications are identified by NOTICE
and the source diff. Font packages Geist and IBM Plex Sans remain under OFL-1.1;
the fonts are redistributed unmodified, with no claim to their reserved names.
The caniuse-lite data is CC-BY-4.0; its original attribution and license are
retained. No dependency is relabeled MIT solely because Get3W uses MIT.

OpenCode v1/v2 are independently licensed third-party engines. Exact versions,
binary hashes, upstream source and license references appear in
`third-party/binary-components.json`. Electron is MIT with additional Chromium,
Node.js and other third-party notices in its distribution. The official Electron 43.8.1 distribution notices are also retained in
`third-party/electron/`. Those distribution notices must remain in the final installer; R-04 verifies the actual installer.

PDF rendering includes @hyzyla/pdfium and the PDFium WebAssembly engine.
The wrapper's MIT text is retained; PDFium and available bundled-library notices
for chromium/7243 are under `third-party/pdfium/`. The wrapper's pinned source
records vendor release 7243. FreeType uses its FTL option (not its alternative
GPL option); its original alternative license file is preserved only as upstream
reference. This software includes code from the FreeType Project (www.freetype.org). Binary archive hashes and notices must stay tied to
the binary version; a wrapper MIT declaration does not replace PDFium licenses.

The Electron packaging configuration includes LICENSE, NOTICE, this file and
the complete third-party directory as legal resources. Installer content and
native sidecar provenance checks remain mandatory in R-04.
