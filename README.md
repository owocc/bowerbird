# Welcome to Your New Wails3 Project!

Congratulations on generating your Wails3 application! This README will guide you through the next steps to get your project up and running.

## Getting Started

1. Navigate to your project directory in the terminal.

2. To run your application in development mode, use the following command:

   ```
   wails3 dev
   ```

   This will start your application and enable hot-reloading for both frontend and backend changes.

3. To build your application for production, use:

   ```
   wails3 build
   ```

   This will create a production-ready executable in the `build` directory.

## Exploring Wails3 Features

Now that you have your project set up, it's time to explore the features that Wails3 offers:

1. **Check out the examples**: The best way to learn is by example. Visit the `examples` directory in the `v3/examples` directory to see various sample applications.

2. **Run an example**: To run any of the examples, navigate to the example's directory and use:

   ```
   go run .
   ```

   Note: Some examples may be under development during the alpha phase.

3. **Explore the documentation**: Visit the [Wails3 documentation](https://v3.wails.io/) for in-depth guides and API references.

4. **Join the community**: Have questions or want to share your progress? Join the [Wails Discord](https://discord.gg/JDdSxwjhGf) or visit the [Wails discussions on GitHub](https://github.com/wailsapp/wails/discussions).

## Project Structure

Take a moment to familiarize yourself with your project structure:

- `frontend/`: Contains your frontend code (HTML, CSS, JavaScript/TypeScript)
- `main.go`: The entry point of your Go backend
- `app.go`: Define your application structure and methods here
- `wails.json`: Configuration file for your Wails project

## Native drag & drop out of the window

Dragging an asset to another application is platform specific, because an HTML5
drag from the webview only publishes text formats (`text/plain`,
`text/uri-list`). Targets that expect real files - Explorer, terminals, Figma,
Photoshop - therefore see a text/URL drop, which is why a browser navigates to
the `file://` URI and reports `about:blank#blocked`.

- **Windows** (`core/drag_windows.go`): `frontend/src/lib/drag-out.ts` cancels the
  webview drag and calls `Service.StartDragItems` with the dragged item ids plus
  the grabbed element's size and pointer offset. The Go side builds a shell data
  object from the item files (`SHCreateDataObject` → `CF_HDROP`,
  `FileGroupDescriptorW`, `FileContents`), hands OLE the shell's own thumbnail
  (or file-type icon) as the drag image via `IDragSourceHelper` - so the ghost
  follows the cursor like the webview's native drag would - and runs
  `DoDragDrop` with a minimal `IDropSource`. The ghost's bitmap is rebuilt as a
  32-bit DIB with an explicit alpha mask and a color key that no visible pixel
  uses: `SHDRAGIMAGE.crColorKey` is the color the control treats as the ghost's
  background, and a zero value means *black*, which used to cut black assets out.
  Only `DROPEFFECT_COPY` is offered, so
  no drop can move or delete a library file.
- Because the native drag re-enters the window as an *external* file drag
  (CF_HDROP), the webview has to be told that the gesture is ours for its whole
  lifetime: `frontend/src/lib/drag-state.ts` holds that flag, and the import
  affordances (sidebar root) and folder drop targets read it so an in-app drag is
  never mistaken for an import.
- On Windows an in-app drop is therefore resolved by the native drop path
  (`WindowFilesDropped` in `main.go`), the same one macOS has always used.
- **macOS** (`core/drag_darwin.go`): the webview drag session is left alone and
  its pasteboard is rewritten into `public.file-url` / `NSFilenamesPboardType`.
- **Linux**: not implemented; the webview's `text/uri-list` drag is what it is.

## Drag & drop tracing

A broken drop target cannot be reproduced from the UI alone, so every step of
the pipeline is traced:

- `frontend/src/lib/drag-trace.ts` — document-level listeners that dump the exact
  payload offered at `dragstart` (formats, file paths, URIs), inbound
  `dragenter`/`drop` payloads, and the `dropEffect` reported at `dragend`
  (`none` means nothing accepted the drop).
- `core/drag_debug.go` — trace sink, `core.LogDragTrace` plus the
  `Service.LogDragTrace` RPC the frontend forwards to.
- `main.go` — native drops delivered by Wails (`WindowFilesDropped`) and the
  import/move branch each drop takes.
- `core/drag_windows.go` — `start-drag` (paths handed to OLE) and
  `drag-out-finished` (`effect=0x1` copy, `0x0` means no target accepted).

Lines are appended to `drag-debug.log` in the app data directory
(`%APPDATA%\bowerbird\drag-debug.log` on Windows,
`~/Library/Application Support/bowerbird/drag-debug.log` on macOS), which is the
only sink visible in production Windows builds (`-H windowsgui` hides stdout).
The path is also printed at startup and shown live in `wails3 dev`. Set
`BOWERBIRD_USER_DATA_DIR` to relocate the app data directory - the Go tests do,
so a test run never touches the real user profile.

## Next Steps

1. Modify the frontend in the `frontend/` directory to create your desired UI.
2. Add backend functionality in `main.go`.
3. Use `wails3 dev` to see your changes in real-time.
4. When ready, build your application with `wails3 build`.

Happy coding with Wails3! If you encounter any issues or have questions, don't hesitate to consult the documentation or reach out to the Wails community.
