---
title: "Cave Flag Culling"
---

# Cave Flag Culling
Ock, Aergyl - 24 November 2023

## Overview
For certain caves (like Pondside Cave), the game checks every object and determines if they belong to inside or outside the cave, and all objects with the outside value culls when Link is inside the cave.

`1.0.0` `1.1.0` `1.1.1` `1.1.2` `1.2.0` `1.2.1`

## Instructions
Method 1:
1. Drop a piece  equipment outside the cave and carry it inside with UH
2. Drop the equipment inside the cave

Method 2:
1. Null-FE an object outside the cave and carry it inside with UH
2. Drop the equipment inside the cave

## Notes
https://discord.com/channels/1086729144307564648/1113557914444111873/1217232464695525496

https://discord.com/channels/1086729144307564648/1113557914444111873/1217234362131546112

https://discord.com/channels/1086729144307564648/1113557914444111873/1217252938485858314
Dropping from higher up makes the cull more consistent
- [Discord](https://discord.com/channels/1086729144307564648/1113557914444111873/1177719304347734027)
- [Discord](https://discord.com/channels/1086729144307564648/1105598687167664239/1206395537193173012)

## See also
- Object Culling
