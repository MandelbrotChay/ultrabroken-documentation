# Zuggling & Smuggling

## Introduction
---

Zuggling and Smuggling are object-transfer and placement glitches. They let players move, hide, duplicate, or desynchronize equipment between zones and saves by abusing item pickup/drop/swap, general equipment handling, and engine state transitions.

This index collects known Zuggle and Smuggle techniques, grouped and linked to individual writeups so you can quickly find triggers, requirements, and mitigations.

## Quick Navigation
---

- **[Zuggle (core concepts)](../glitchcraft/0023-zuggle.md)** - Overview of core zuggle mechanics and basic examples.
- **[Equipment Collision Zuggle](../glitchcraft/0024-equipment-collision-zuggle.md)** - How equipment collisions can induce zuggles.
- **[Map Zuggling](../glitchcraft/0049-map-zuggling-mz.md)** - Zuggling triggered by map transitions and geometry.
- **[Save-Load Zuggling](../glitchcraft/0050-save-load-zuggling-slz.md)** - Behaviors involving saving/loading sequences.

- **[Pickup Smuggling](../glitchcraft/0061-pickup-smuggling.md)** - Smuggling via pickup interactions.
- **[Drop Smuggling](../glitchcraft/0070-drop-smuggling.md)** - Techniques using dropped objects.
- **[Equipment Smuggle](../glitchcraft/0073-equipment-smuggle.md)** - Smuggling by swapping/equipping items.
- **[Shock Smuggle](../glitchcraft/0074-shock-smuggle.md)** - Physics/impact-based smuggle variants.
- **[Arrow Smuggling](../glitchcraft/0076-arrow-smuggling.md)** - Using projectiles to transfer or hide objects.

- **[Smuggle Stacking Zuggle](../glitchcraft/0078-smuggle-stacking-zuggle-ssz.md)** - Stacking tricks that compound smuggles.
- **[Drop Delay Zuggle](../glitchcraft/0079-drop-delay-zuggle-ddz.md)** - Timing-based drop delays creating zuggles.
- **[Force-Equip Zuggling](../glitchcraft/0080-force-equip-zuggling-fez.md)** - Forcing equips to trigger state transfers.
- **[Zuggle Load / Object Transferring](../glitchcraft/0082-zuggle-load-object-transfering-zlot.md)** - Transferring objects between contexts.

- **[Overload / Overload Drop Smuggling](../glitchcraft/0090-overload-drop-smuggling.md)** - Overload-driven smuggle scenarios.
- **[Like-Like Smuggling](../glitchcraft/0095-like-like-smuggling.md)** - Like-Like entity based smuggling techniques.
- **[Like-Like Drop Smuggling](../glitchcraft/0096-like-like-drop-smuggling.md)** - Drop-specific Like-Like methods.
- **[Like-Like Zuggling](../glitchcraft/0097-like-like-zuggling.md)** - Zuggling variants using Like-Likes.
- **[Drop Zuggle](../glitchcraft/0099-drop-zuggle.md)** - Classic drop-induced zuggle patterns.

- **[Cull / Hold / Quick Smuggling](../glitchcraft/0131-cull-smuggle.md)** - Storage and quick-transfer smuggle families.
- **[Hold Smuggling](../glitchcraft/0143-hold-smuggling.md)** - Holding-based smuggle techniques.
- **[Quick Smuggling](../glitchcraft/0145-quick-smuggling.md)** - Fast transfer tricks.
- **[Hand-Locked Equipment Smuggling](../glitchcraft/0151-hand-locked-equipment-smuggling-hles.md)** - Smuggling when hands/devices are locked.

- **[Dynamic Zuggle & Variants](../glitchcraft/0171-dynamic-zuggle.md)** - Dynamic actor/object interactions creating zuggles.
- **[LikeLike Stick Smuggling](../glitchcraft/0185-likelike-stick-smuggling.md)** - Stick-based LikeLike variants.
- **[Master Sword Zuggling](../glitchcraft/0191-master-sword-zuggling-decayed-master-sword-zuggling.md)** - Master-sword-specific cases.

- **[Mineru / Lift / Wuggle / Invizuggle](../glitchcraft/0203-mineru-hold-smuggle-mhs.md)** - Mineru and related hold/lift variants.
- **[Lift Smuggle](../glitchcraft/0221-lift-smuggle.md)** - Lift-oriented smuggle techniques.
- **[Wuggle](../glitchcraft/0206-wuggle-weird-zuggle.md)** - Wuggle / weird zuggle phenomena.
- **[Invizuggle](../glitchcraft/0208-invizuggle.md)** - Invisible-object zuggling methods.

- **[Community Variants & Utilities](../glitchcraft/0225-kilovictor-s-quicksmuggle.md)** - Community-discovered quicksmuggle utilities.
- **[Portacull Invismuggle](../glitchcraft/0228-portacull-invismuggle.md)** - Portacull community variant.

- **[Weapon-stand / Quick Drop / Chasm Delay](../glitchcraft/0231-weapon-stand-dynamic-zuggle.md)** - Weapon-stand and quick-drop patterns.
- **[Quick Drop Smuggle](../glitchcraft/0233-quick-drop-smuggle-qds.md)** - Fast drop-based smuggles.
- **[Chasm Delay Zuggle](../glitchcraft/0238-chasm-delay-zuggle-cdz.md)** - Delay effects near chasms.

- **[Storage, Retrieval & Overload Dynamics](../glitchcraft/0246-cull-storage-zuggle-csz.md)** - Storage and retrieval-driven methods.
- **[Smuggle Retrieval](../glitchcraft/0262-smuggle-retrieval.md)** - Retrieval-focused workflows.
- **[Overload Dynamic Zuggle](../glitchcraft/0274-overload-dynamic-zuggle.md)** - Overload dynamic variants.

- **[Advanced / Edge Cases](../glitchcraft/0278-double-bypass-zuggle-dbz.md)** - Edge-case exploits and bypasses.
- **[Ocklusion Hovering](../glitchcraft/0284-ocklusion-hovering.md)** - Occlusion/hovering edge behaviors.
- **[Void Dipping](../glitchcraft/0291-void-dipping.md)** - Void-dipping and related effects.
- **[Zuggle Overload Desync](../glitchcraft/0294-zuggle-overload-desync.md)** - Desync cases from overloads.

## What to expect in each writeup
---

- **Trigger:** how to reproduce (inputs, positions, equipment)
- **Requirements:** game version, objects, NPCs, devices
- **Behavior:** observable effects and common outcomes
- **Risks & Warnings:** save/desync risks and suggested safety steps
- **Notes:** variations, related techniques, and links to follow-ups

## Safety & best practices
---

- Always test on throwaway saves or copies. These glitches can corrupt progress.
- Prefer manual backups (copy / cloud-backup the save file) rather than relying on in-game saves.
- Use the writeups in this index to compare variants before attempting advanced chains.

## Want more?
---

See the full set of Zuggling/Smuggling writeups in the sidebar for step-by-step guides, videos, and community notes.
