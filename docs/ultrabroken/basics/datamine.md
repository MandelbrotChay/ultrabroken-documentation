# Datamine: The Root Cause

## What the Code Reveals

MrCheeze managed to uncover the cause of Ultrabroken within the game's code. It appears that during The Riverside Trolls' dialogue, there is a boolean variable named `IsAwaitEnd` that is inexplicably set to `false`. 

Subsequently, a mod was developed to set this boolean to `true`, effectively resolving the Ultrabroken issue. It's worth noting that this incorrectly set boolean is completely unparalleled throughout the entire game thus far.

## The Code Snippet

Here is the code snippet where the magic occurs:

```python
GameSystemActor.EventClearActorsAnchor(
    {
        'IsSweepOut': True,
        'AnchorActorName': 'DestinationActor',
        'AnchorInstanceName': 'LinkWarp_AfterZoronaEvent',
        'Radius': 5.0,
        'Height': 4.0,
        'IsDeleteActor': True,
        'IsExcludePlacedAroundAnchor': False,
        'IsWaitEnd': False  # <-- THE BUG!
    }
)

The `IsWaitEnd` being set to `False` instead of `True` causes the system to fail to properly wait for the end of the anchor clearing sequence, leaving objects in a broken state.

---

**Now that you understand the core mechanic, explore the [Effects](../../effects/)!**


