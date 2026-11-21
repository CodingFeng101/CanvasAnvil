# How works are stored

Every canvas has its own database, and every work holds a set of keys in it. This page is about how those keys are laid out, and why it ended up with no Save button at all.

```diagram
works
```

## The keys

Each canvas keeps its works in its own IndexedDB:

| Key | Holds |
| --- | --- |
| `works:index` | The list of works (those listed, and the current draft) |
| `works:current` | The id of the work the canvas has open |
| `work:<id>:<key>` | The work's live content, under the canvas's own keys one by one |
| `work:<id>:local-storage` | The work's small localStorage settings while it is not on screen |
| `saved:<id>:<key>` | A snapshot, read only for an explicit restore |

The canvas always reads and writes the live copy, `work:`, so a reload loses nothing: the live copy is the work.

## What about localStorage

Some small state (the selected template, a panel's width) has always lived in localStorage, read directly by synchronous code. To leave that code alone, the open work keeps using the original keys; **leaving** a work copies those values into its `local-storage` entry, and **entering** another writes its values back.

## Switching works: unmount, swap, remount

When you open another work of the same canvas:

1. the canvas is taken off screen, and its unmount writes the last change into the work being left;
2. the works store swaps the localStorage values and the current id;
3. the canvas renders again keyed on the new id, reading everything from the new work's keys.

The canvas's own "load on mount, save on change" logic needs no change at all.

> [!WHY]
> Each of the four canvases already had a mature way of saving. Had the works store been taught each canvas's data structures, it would need changing for every new canvas. Instead it knows keys, not contents: any canvas that stores by key gets multiple works for free.

## Why there is no Save button

An earlier version had one: the draft saved itself, the work changed only when you pressed Save, and leaving asked "save / don't save / cancel". In use it was one more thing to worry about: was this version saved or not?

So it became like a chat on claude.ai: a work appears in the list on its own once it has content; what is on screen is what is kept; only an empty draft is dropped on leaving. The `saved:` snapshot stays, for an explicit restore.

## Upgrading and rolling back

The first time a canvas runs with works, what it saved before (its old keys and localStorage) becomes the first work. The old keys are **copied**, not moved: rolled back to an older release, it still finds its data.

> [!NOTE]
> Storage keys and database names are never renamed once released. A rename would make people's works "vanish" in the new version, even with the data still on disk.

## The backup format

Settings → Data → Export writes every entry of all four canvases' databases, along with each canvas's current localStorage snapshot, into one JSON file. Import checks the format, clears the stores, writes the entries back one by one, restores localStorage and reloads the page.
