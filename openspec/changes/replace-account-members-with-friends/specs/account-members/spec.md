## REMOVED Requirements

### Requirement: Account members have explicit roles
**Reason**: Accounts become single-Human personal resource boundaries; friendship does not create Account membership or roles.
**Migration**: Keep one internal owner record per personal Account during transition, remove member/admin product APIs and migrate any real non-owner data through an explicit audited plan.

### Requirement: Owners and admins can invite members
**Reason**: Role-bearing Account invitations are replaced by role-free Human friend invitations visible in the recipient's inbox.
**Migration**: Revoke or expire pending member invitations; never auto-accept or silently convert them into Friendship.

### Requirement: Role changes and member removal preserve ownership invariants
**Reason**: Friends do not own or administer each other's resources, so role changes and member resource transfer no longer exist.
**Migration**: Audit any real non-owner resource ownership, create a personal Account for that owner and move resources only through an explicit migration plan before disabling member mutation.

### Requirement: Members UI supports complete management states
**Reason**: The Members surface is replaced by Friends, incoming invitations and outgoing invitations without roles or resource disposition.
**Migration**: Remove role, member removal and transfer UI; route the prior destination to Friends or an explicit migration state.
