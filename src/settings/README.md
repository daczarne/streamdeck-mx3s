# settings

The backend's upper layer: what Stream Deck keeps of the keys, which the settings pages save. Its modules import nothing from the rest of `src/`, and nothing from the frontend.

1. `schemas.ts`: each setting's default and valid values, against which every action reads what Stream Deck sends.

Storing a setting is the backend's work, even when the setting is about what a key shows, such as the Battery key's colors: what the value is turned into on the key is the frontend's.
