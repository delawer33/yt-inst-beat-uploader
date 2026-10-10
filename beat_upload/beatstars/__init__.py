"""Putting a beat on BeatStars: a Track Package and the Studio form that publishes it.

``naming`` reads what the owner writes into a file name (bpm, key, moods, samples),
``track`` holds the metadata BeatStars asks for and builds it from a YouTube upload,
``package`` lays out the files (trimmed master WAV, tagged MP3, square cover, json) and
``studio`` fills the Studio form with Playwright, which is an optional extra.
"""
