# Markup Contracts

This document records React markup contracts that must survive future markup,
layout, or component rewrites. These are not merely visual preferences: hooks,
GSAP selectors, Radix primitives, browser APIs, form handlers, navigation, and
the Supabase/offline layers depend on some of the elements, attributes, refs,
and class names described below.

When changing markup, preserve the contract or update every consumer in the
same change. The source locations below are review anchors; line numbers may
move as files evolve.

## 1. Structure and refs

### Shared section layout

- `src/components/common/SectionLayout.tsx:56-74` has two runtime refs:
  `sectionRef` belongs on the outer `<section>`, and `contentRef` belongs on
  the inner content wrapper. Keep both elements and their parent/child
  relationship. `useSectionEntrance` animates `contentRef` inside the GSAP
  context scoped to `sectionRef` (`src/components/common/SectionLayout.tsx:59-65`,
  `src/hooks/useSectionEntrance.ts:42-57`).
- Keep the `SectionLayout` header/content/footer structure and the `children`
  slot (`src/components/common/SectionLayout.tsx:76-97`). The back action is
  supplied through `onBack` and rendered by `SectionBackButton`; do not replace
  it with a navigation link that bypasses the callback.
- The outer section's `min-h-screen`, gradient class, `relative`, and
  `overflow-hidden` are part of the shared page boundary
  (`src/components/common/SectionLayout.tsx:68-74`). A rewrite may change
  presentation deliberately, but must retain a section-level animation scope
  and a content target if it changes this wrapper.

### GSAP entrance targets

- `src/hooks/useSectionEntrance.ts:17-25,42-59` supports two target shapes:
  an element (`ref.current`) or descendants selected by
  `ref.current.querySelectorAll(selector)`. A target selector must resolve to
  the intended descendants, and an empty result is intentionally skipped.
- Keep the GSAP context rooted at `sectionRef` and its `ctx.revert()` cleanup
  (`src/hooks/useSectionEntrance.ts:42-59`). Removing the scoped context or
  cleanup can leave animation styles and triggers behind after a section is
  unmounted.
- Components with local timelines must keep their refs attached to the same
  semantic targets. For example, `LandingSection` uses `sectionRef`,
  `headlineRef`, `cardRef`, and `scrollHintRef`
  (`src/sections/LandingSection.tsx:23-26,60-98`), while the shared section
  animation queries inside its headline and card targets.

### Media and scanner refs

- The QR scanner requires both `videoRef` and `canvasRef` to remain attached to
  the camera video and capture canvas (`src/sections/AttendanceManagementSection.tsx:101-103`).
  Its effect reads the video dimensions, draws the video into the canvas, reads
  image data, and sends decoded text to the current scan handler
  (`src/sections/AttendanceManagementSection.tsx:423-454`).
- Scanner cleanup is part of the contract: stopping the animation frame,
  stopping every `MediaStreamTrack`, and clearing `video.srcObject` must remain
  coupled to the effect cleanup (`src/sections/AttendanceManagementSection.tsx:528-534`).
- The decorative network canvas must retain `canvasRef` and a real `<canvas>`
  element. The animation obtains a 2D context from the ref and renders through
  browser canvas APIs (`src/components/ui/animated-network.tsx:35-60,143-146`).

## 2. Selectors and class hooks

Classes used by JavaScript are contracts. Do not rename, remove, or move them
outside the ref scope without changing the corresponding selector.

- `.word` is queried by the landing-page headline animation
  (`src/sections/LandingSection.tsx:72-78`) and is applied to each animated
  headline word (`src/sections/LandingSection.tsx:149-153`). Preserve one
  `.word` element per animated word, or update the animation to match the new
  markup.
- `.feedback-card` is queried from `cardsRef` by GSAP
  (`src/sections/FeedbackSection.tsx:30-55`) and is assigned to the feedback
  tab buttons (`src/sections/FeedbackSection.tsx:178-183`). Keep those elements
  inside the `cardsRef` subtree if the scroll entrance animation is retained.
- `.summary-card` is used as the dashboard and transparency summary-card
  animation/target hook. Examples are
  `src/sections/AdminDashboardSection.tsx:326-337` and
  `src/sections/TransparencyBoardSection.tsx:473-478,492-520`.
- `.action-card` identifies dashboard quick-action buttons
  (`src/sections/AdminDashboardSection.tsx:417-428`). They must remain actual
  clickable buttons whose handler calls `onNavigate(action.view)`.
- `data-slot` attributes emitted by the shared Radix wrappers are structural
  hooks, not disposable styling metadata. In particular, dialog content emits
  `data-slot="dialog-content"` and wraps children in `ScrollArea`
  (`src/components/ui/dialog.tsx:48-80`), while dropdown triggers/content emit
  `data-slot="dropdown-menu-trigger"` and
  `data-slot="dropdown-menu-content"`
  (`src/components/ui/dropdown-menu.tsx:21-49`). Preserve them when replacing
  wrapper markup or update selectors such as the QR modal's scroll-area
  selector (`src/components/StudentQrModal.tsx:68`).

## 3. Radix composition and modal/dropdown behavior

- `DialogContent` is not a plain `<div>`: it renders through a portal,
  includes the overlay, provides the Radix content primitive, wraps content in
  `ScrollArea`, and adds the default close button with a screen-reader label
  (`src/components/ui/dialog.tsx:48-80`). Keep `DialogHeader` and
  `DialogTitle` inside it so Radix can preserve dialog labelling and focus
  behavior.
- Controlled dialogs must preserve the `open`/`onOpenChange` relationship. For
  example, `ReceiptViewer` derives `open` from `receiptUrl`
  (`src/components/ReceiptViewer.tsx:57-65`), and `StudentQrModal` derives it
  from `student` (`src/components/StudentQrModal.tsx:66-74`). Closing the dialog
  must call the supplied callback rather than only hiding DOM.
- `DropdownMenuTrigger asChild` requires the trigger's button to remain the
  single composed child. Receipt export relies on this composition at
  `src/components/ReceiptViewer.tsx:91-110`; student-record download actions
  use the same pattern at `src/sections/StudentRecordSection.tsx:500-517`.
  Do not insert a sibling, fragment, or non-interactive wrapper inside that
  `asChild` trigger.
- Dropdown content is portalled and items carry Radix state/disabled behavior
  (`src/components/ui/dropdown-menu.tsx:32-49,60-80`). Keep actions as
  `DropdownMenuItem` elements with their `onClick` handlers, rather than
  visually styled spans.
- The shared tabs wrappers preserve Radix's `data-state` attributes and
  keyboard/focus behavior (`src/components/ui/tabs.tsx:37-63`). If a rewrite
  uses `Tabs`, `TabsList`, `TabsTrigger`, or `TabsContent`, retain their
  `value` relationships and do not replace triggers with non-focusable `<div>`
  elements. The public feedback view currently implements its own controlled
  tab buttons with `activeTab` and `setActiveTab`
  (`src/sections/FeedbackSection.tsx:14-17,178-183`), so those callbacks are
  also a contract.

## 4. Forms and controls

- Controlled inputs must continue to expose their state through `value` and
  update it through `onChange`. The reusable search control is the canonical
  example (`src/components/common/SearchFilterBar.tsx:34-51`). Its clear
  control must remain `type="button"`; otherwise it can submit a surrounding
  form.
- Search submission is a form contract: `LandingSection` prevents the browser
  default, delegates the exact `name` and `studentId` values to `onSearch`,
  and disables submission while searching (`src/sections/LandingSection.tsx:100-105,291-317`).
  Preserve the submit button's `type="submit"` and the surrounding `<form>`.
- Feedback submission follows the same pattern. The handler prevents the
  default, validates a trimmed message, submits the selected `activeTab`, and
  conditionally omits identity fields for anonymous feedback
  (`src/sections/FeedbackSection.tsx:57-97`). Keep the submit button as
  `type="submit"` and keep the anonymous toggle as `type="button"`
  (`src/sections/FeedbackSection.tsx:258-269,312-317`).
- File inputs are functional controls, not interchangeable visual buttons.
  Student CSV/Excel import uses a hidden input ref, an exact `accept` list, and
  `onChange={handleFileSelected}` (`src/sections/StudentManagementSection.tsx:336-367`).
  The hook reads the first file, resets `event.target.value` so the same file
  can be selected again, validates `.csv`/`.xlsx`, and delegates rows
  (`src/hooks/useSpreadsheetImport.ts:33-84`). Preserve the ref and input
  change event even if the visible trigger is redesigned.
- Requirement-file create and replace inputs must retain their refs, accepted
  file types, and `onChange` handlers
  (`src/sections/RequirementFilesManagementSection.tsx:523-534,605-610`).
  The component also explicitly clears those refs when opening/resetting a
  flow and after replacement (`src/sections/RequirementFilesManagementSection.tsx:134-149,205-218`),
  so do not make the inputs permanently uncontrolled in a way that prevents
  reset or re-selection.
- Buttons inside dialogs and cards should declare their intent explicitly with
  `type="button"` unless they intentionally submit a form. This is especially
  important for modal Cancel/Upload controls and menu triggers, which currently
  rely on click handlers and disabled state
  (`src/sections/RequirementFilesManagementSection.tsx:556-580`).

## 5. Accessibility and interaction semantics

- Preserve real semantic headings and labels. `SectionLayout` renders the page
  title as an `<h1>` and subtitle as a `<p>`
  (`src/components/common/SectionLayout.tsx:76-89`); dialog titles use the
  Radix title primitive (`src/components/ui/dialog.tsx:107-117`). Do not
  replace these with styled generic containers.
- Every dialog must retain a `DialogTitle`, and the shared close control's
  visually hidden `Close` label must remain available
  (`src/components/ui/dialog.tsx:70-77`). Keep meaningful `alt` text for
  generated or uploaded images; receipt and QR previews provide explicit alt
  values at `src/components/ReceiptViewer.tsx:71-79` and
  `src/components/StudentQrModal.tsx:79-85`.
- Preserve keyboard-focusable native controls for tabs, menu triggers, search
  clear, download, and navigation actions. Existing examples use buttons with
  `aria-label` where the visible content is icon-only, such as student actions
  (`src/sections/StudentManagementSection.tsx:500-504`). A markup rewrite
  must not turn these controls into clickable non-semantic elements.
- Keep disabled states tied to in-flight work. Receipt, QR, import, upload,
  and feedback controls disable or show loading indicators while their async
  work is active (`src/components/ReceiptViewer.tsx:91-136`,
  `src/components/StudentQrModal.tsx:98-125`,
  `src/hooks/useSpreadsheetImport.ts:47-80`). Removing those attributes can
  cause duplicate writes/downloads.

## 6. Browser APIs and generated output

- QR scanning depends on a real `<video>` receiving `MediaStream.srcObject` and
  a real `<canvas>` receiving frames. The effect requests camera permission
  through `navigator.mediaDevices.getUserMedia`, enumerates video devices, and
  falls back between selected, environment, and generic cameras
  (`src/sections/AttendanceManagementSection.tsx:456-514`). Preserve the
  video/canvas elements and their refs when changing the scanner layout.
- Receipt actions are browser behaviors, not just links: opening uses
  `window.open(..., "_blank", "noopener,noreferrer")`, while downloading calls
  `downloadReceipt` (`src/components/ReceiptViewer.tsx:38-55`). Keep the Open
  and Download handlers attached to actual buttons and preserve the generated
  SVG format options (`src/components/ReceiptViewer.tsx:21-25,91-137`).
- QR attendance-pass preview/download must use the same generated SVG source
  for display and export. `StudentQrModal` waits for
  `studentAttendancePassSvg`, stores a data-image URL, and only enables PNG
  download once the preview is ready (`src/components/StudentQrModal.tsx:23-38,40-64,76-90`).
  The payload contract includes version, kind, student ID, name, program, year,
  and section (`src/lib/qr.ts:17-43`); markup must not silently omit or reorder
  the pass output around those values.
- PNG generation relies on an `Image`, an object URL, a 2D canvas, and
  `canvas.toBlob` (`src/lib/qr.ts:212-236`). Receipt raster export similarly
  uses canvas conversion (`src/lib/receipts.ts:255-260`). Do not replace the
  output image with a CSS-only approximation when the same export is expected.

## 7. Navigation, auth, and integrations

- Navigation is state-driven, not URL-driven. `App` passes `currentView` and
  `navigateTo` to `Navigation`, renders the selected view in the `Suspense`
  boundary, and scrolls to the top on navigation
  (`src/App.tsx:185-189,402-419`). Preserve `onNavigate(view)` calls and the
  `ViewState` values; changing visible labels alone must not change the view
  identifiers (`src/sections/Navigation.tsx:22-26,72-84`).
- Admin rendering is access-controlled in `App`. Protected cases call
  `canAccess` before rendering management sections and otherwise return the
  login view (`src/App.tsx:204-228,302-389`). Do not expose a protected section
  by moving its markup outside this check or by relying only on hidden CSS.
- Auth state is supplied by Supabase Auth and the `user_roles` table. The auth
  service signs in, resolves the role, caches only the matching user's role,
  restores the persisted session, and signs out users with no valid role
  (`src/services/auth.ts:30-67,84-97,145-168,171-229`). Markup changes must
  preserve the login form callbacks and the role-dependent navigation rather
  than introducing client-only role assumptions.
- Supabase remains the data and storage integration boundary. The project
  documentation specifies that UI sections use the Supabase client/service
  layer, server-side RLS performs role checks, and the public `receipts` bucket
  is used for receipt storage (`SUPABASE_INTEGRATION.md:1-5,191-210`). Keep
  receipt/file URLs and service callbacks connected to their existing controls.
- Offline sync is officer-only and owner-scoped. `App` starts/stops the service
  and configures it from the authenticated user ID and role
  (`src/App.tsx:74-83`); the service enables itself only for officer roles with
  IndexedDB and listens to `online`/`offline` events
  (`src/lib/offlineSync.ts:64-76,150-185`). Do not remove the sync status
  surface or replace a mutation control with a flow that assumes connectivity.
- Offline mutations update the local cache, queue the mutation (and any pending
  file blob), and replay in strict creation order; network failures are queued
  even when `navigator.onLine` is still true
  (`src/lib/offlineSync.ts:286-370`). Any markup rewrite of save, upload,
  replace, delete, or status controls must preserve their loading/error state
  and not bypass the service-layer mutation path.

## Review checklist for markup rewrites

Before merging a markup rewrite, verify:

- Runtime refs still point to the same kind of element and remain in the
  expected parent/ref scope.
- `.word`, `.feedback-card`, `.summary-card`, and `.action-card` are preserved
  wherever their corresponding GSAP or interaction behavior remains.
- Radix composition still has valid `DialogTitle`, `DialogContent`,
  `DropdownMenuTrigger asChild`, menu items, and tab value relationships.
- Forms retain controlled values, handler callbacks, explicit button types,
  file-input refs, `accept` attributes, and async disabled states.
- Native semantics, labels, alt text, focus behavior, and screen-reader text
  remain intact.
- Camera, canvas, download, QR, Supabase, auth, navigation, and offline-sync
  handlers are still attached to the elements users operate.
- `npm run build` and `npm run lint` pass, and the resulting diff does not
  modify unrelated application files.