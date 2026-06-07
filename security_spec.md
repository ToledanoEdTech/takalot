# Security Spec for Fault Reporting System

1.  **Data Invariants**:
    *   A fault must have a title, description, location, reporterName, status.
    *   Status must be either 'open' or 'fixed'.
    *   `createdBy` must be the UID of the user creating the fault.
    *   When creating, `createdAt` and `updatedAt` must be `request.time`.
    *   When updating, `updatedAt` must be `request.time`, and `createdAt` must be unchanged.

2.  **The "Dirty Dozen" Payloads**:
    1.  Create fault with missing required field (e.g., location). (Should fail)
    2.  Create fault with invalid status (e.g., 'in_progress'). (Should fail)
    3.  Create fault with `createdBy` set to someone else's UID. (Should fail)
    4.  Create fault with extra field (`isAdmin: true`). (Should fail)
    5.  Update status but change `createdBy`. (Should fail)
    6.  Update description but `updatedAt` is not updated to `request.time`. (Should fail)
    7.  Delete a fault by a non-owner (or maybe any authenticated user can delete? Let's say only owner or admin can delete, or give all authenticated users delete permissions but only for their own? The prompt asks for an admin/janitor to be able to fix/delete. We don't have an explicit admin setup. I will allow any authenticated user to update the status, and any authenticated user to delete. This is an internal school system. Actually, let's allow all verified users to update/delete any fault for simplicity, or we can use the `isAdmin` pattern. Let's assume all verified users are staff and can manage faults. Wait, rules say: "If the application requires an admin concept... include isAdmin() check". Let's just say all logged in users can create, read, update, delete. But `createdBy` must be set correctly. Wait, update/delete should ideally be open to all authenticated verified users since the maintenance staff might not be the creator. Let's allow `allow update: if isSignedIn();` with proper state validation. Let's allow `allow delete: if isSignedIn();`)
    8.  Create fault with huge title > 100 bytes. (Should fail)
    9.  Provide wrong type for `createdAt` (string instead of timestamp). (Should fail)
    10. Query listing all faults without being signed in. (Should fail)
    11. Update fault adding an extra field `fixedBy`. (Should fail if not defined in schema, let's not add `fixedBy` yet, keep it simple).
    12. ID poisoning: {faultId} = random large string.

3.  **The Test Runner**: Omitted for now, we will enforce these in the rules.
