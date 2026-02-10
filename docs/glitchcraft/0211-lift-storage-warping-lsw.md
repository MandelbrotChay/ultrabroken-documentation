---
title: "Lift Storage Warping"
---

# Lift Storage Warping `LSW`

## Overview
Culling link while holding a zlot'ed item puts link into a wrong warp state. After loading a file, he will get placed between his position before the file load and the position from the file loaded. Loading the same file again won't change his position though.
Using detanglement makes this wrong warp state permanent.

`1.0.0` `1.1.0` `1.1.1` `1.1.2` `1.2.0` `1.2.1`

## Instructions
1. Setup sdc culling
2. zlot an item, like a battery
3. pickup the item and leave the culling area
4. load a file
5. (optional, makes it permanent) use a rocket shield

## Notes
Test with like like stick culling

## Credit
mulberry

## Date
8 January 2024

## Resources
- [Discord](https://discord.com/channels/1086729144307564648/1105598687167664239/1194030076233257020)

## See also
- Stick Desync ClipObject Culling
