# RC3 Incident Review — Recursive Account Page Rendering

The RC3 diagnostics showed repeated `RangeError: Maximum call stack size exceeded` failures on `/akun-role/`. The call chain repeatedly cycled through `renderAdminWorkspaceModule → renderWorkspaceUI → renderAccessUI → showTab → renderPageModule → renderAdminWorkspaceModule`.

RC4 removes the recursive workspace render from the account page renderer, corrects the guest-auth redirect condition, and adds a re-entrancy guard to the page-module registry. The Status page now treats old diagnostic history as historical context rather than an active outage by itself.
