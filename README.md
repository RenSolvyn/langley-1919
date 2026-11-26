# Langley Field, 1919

A walkable, real-time reconstruction of the Army aeronautical laboratory that Albert Kahn designed at Langley Field, Virginia. It opened in June 1919 and became headquarters for the field. Both floors and all 42 rooms are built from the original plans. The simulation runs in any modern browser, including phones.

**Live:** https://rensolvyn.github.io/langley-1919/

## Controls

| Desktop | Phone |
| --- | --- |
| WASD or arrows to walk, Shift to run | Left thumb anywhere on the left half to walk. Push to the rim to run |
| Mouse to look (click to capture the pointer) | Right thumb to look. Look speed is in the Map panel |
| E or Enter to move a conversation on | Tap to move a conversation on or close a note |
| Space to jump | Jump button |
| V cycles 1st, 3rd and 2nd person views | View button |
| M opens the map with quick travel | Map button |
| N switches between day and night, L turns the lamps on or off | Night button (a Lamps button appears at night); the Map panel also has a Night switch |

Walk up to anyone to hear what they have to say. Eight field notes are hidden across the wings and both floors, and the map marks the ones you have found.

### Phone controls, and why they are built this way

- **Floating stick.** It appears wherever your left thumb lands. If your thumb slides past the rim, the stick follows it, so you never run out of travel. A radial dead zone stops drift, and a power curve makes a small push a slow, precise walk.
- **Screen-normalised look.** A swipe across the long side of the screen turns about 170 degrees on any phone or tablet. The gain scales with field of view. Slow drags aim finely and quick flicks turn fast. Look input is applied on the touch event with no smoothing, so it adds no lag.
- **Auto-level.** While you walk without touching the look side, the view eases back to level, the way console games re-centre.
- **Hor+ field of view.** In portrait the view widens, so you are not looking through a slot.
- **Landscape first.** The walk is laid out for a phone held sideways: a wide view of each room and room for both thumbs. Held upright, a card asks you to turn the phone (you can carry on in portrait). On Android the screen also locks to landscape once the walk goes full screen.
- **Thumb-safe layout.** Every button is at least 44 px and sits clear of the notch, the screen edges and the home indicator. Subtitles stay out of the thumb zones and never block a touch.
- **Small things.** Light haptics on jump, hard landings and found notes (Android). The screen stays awake, Android goes full screen, and all input resets when the app goes to the background, so nothing sticks.

## How it looks real

- **Day and night on one physical scale.** Every light is in real units (engine 1.0 = 10,610 cd/m2): the afternoon sun, 200 W tungsten pendants, a full moon (about 2,500 cd/m2) and a moonlit sky (0.02 to 0.05 cd/m2). Night is not a darkened day: the sky, sun and sky light fade out over 4 seconds, the eye adapts by up to 220 times, and colour fades toward the blue-grey of night vision (the Purkinje shift) as light falls.
- **Lamps you can switch.** Each pendant's light was path traced on its own in Blender Cycles into a separate lamp lightmap layer, so lamps light the rooms, the courtyard paving and the lawn through the windows with soft bounce light, and switch on and off without a re-bake. Tungsten filaments warm up and cool down over a fraction of a second.
- **A moon that lights the site.** A visible moon with its halo, stars and a night horizon glow. Moonlight comes from the moon's direction through the same ray-cast shadow map as the sun, so the building casts real moon shadows. The moon is set about 4 times brighter than a real full moon, a common film choice so the site reads at night on a screen.
- **Ray-traced reflections rebuilt by a small network.** One reflection ray per four pixels is importance-sampled from each surface's GGX lobe and traced through a closest-depth pyramid (Hi-Z), so long rays across a corridor cost a few dozen steps. A trained network then rebuilds clean glossy reflections, choosing per pixel how widely to pool neighbouring rays, how long to keep history, how tightly to clip it, and whether to follow the surface or the reflected image when the camera moves (DLSS Ray Reconstruction does the same job with a much larger network). Rays that leave the screen fall back to the room probe. Polished surfaces take their whole reflection from this pass, so nothing is counted twice, and the strength follows real Fresnel: about 4 % straight down at your feet, over 30 % toward the far end of a corridor. Trained on 9 camera paths inside the building and scored on 3 others, against 64-ray ground truth (PSNR on polished surfaces, display space): one ray per pixel unfiltered scores 39.8 dB, the hand-tuned reconstruction 46.1 dB, the network 48.2 dB.
- **Room reflection probes.** When you enter a room, a cube map is captured from your position, one face per frame, filtered for every roughness and box-projected to the room's walls, so reflections line up with the walls around you. At night the probe holds the lamp-lit room.
- **Finishes from the period.** Ground and waxed terrazzo (roughness 0.10), waxed oak (0.24), waxed linoleum (0.22), honed marble and shellacked woodwork. A waxed floor is close to a mirror at grazing angles and nearly matte straight down, which is what you see walking a polished corridor.
- **Temporal super resolution with a small trained network.** The scene is drawn at a lower internal resolution and rebuilt at full display resolution, the way DLSS, FSR 2 and Unreal's TSR do it. Each frame is rendered with a sub-pixel Halton jitter whose cycle grows with the upscale factor r (8 x r squared frames), so over a few frames every display pixel receives real samples. The resolve pass undoes the jitter and weights the nearest internal samples by their true distance to each display pixel. It fetches the previous result where that surface was last frame (depth reprojection from the nearest-depth neighbour, Catmull-Rom resampling), clips it to the colour range the current samples allow (YCoCg variance clipping), and blends by evidence: the history stores a per-pixel sample count, and new samples add their kernel weight. Blending happens in an exposure-aware tonemapped space, so bright edges resolve the way the eye sees them. Textures are read sharper by the upscale factor (mip bias), so brick, plaster and grain keep their detail. At native scale on desktop the same pass is the anti-aliasing (41.5 vs 40.2 dB for the old filter on a held-out walk, scored offline).
- **The network inside the upscaler.** Four decisions are made per pixel by a small neural network instead of fixed rules: how much of the stored history still holds, how wide the clip box may be, how strongly to clip at all, and how much of a smooth spatial estimate to mix in where history is thin. It sees 18 inputs (sample coverage, distance to the nearest sample, stored count, clip distance, motion, depth edge, local contrast, history disagreement, scale and the 3 x 3 luma window), has 12 hidden units and 4 outputs, and runs inside the same shader pass at under 300 multiply-adds per pixel. It was trained offline on 11 camera paths through this building (walking, running, turning, standing and slowly looking around) against 12-sample supersampled ground truth, through a differentiable copy of the shader, then compiled into the shader as constants. Measured in the engine on 5 held-out paths, against that ground truth (PSNR in display space, higher is better):

  | Held-out path | Render scale | Old path (TAA, then stretch) | TSR with network |
  | --- | --- | --- | --- |
  | Walking across the field | 75 % | 38.4 dB | 40.1 dB |
  | Turning on the roof | 62.5 % | 32.5 dB | 35.2 dB |
  | Running across the lawn | 50 % | 28.2 dB | 29.9 dB |
  | Standing in the court, a soldier walks past | 75 % | 31.2 dB | 32.4 dB |
  | Standing in an office | 62.5 % | 29.8 dB | 35.4 dB |

  The new path also beats the old one when it draws fewer pixels: at 62.5 % scale it scores 35.2 and 35.4 dB where the old path at 72 to 75 % scores 33.6 and 31.0 dB. In the offline copy, the same upscaler with hand-tuned rules scores 0.1 to 1.4 dB lower and leaves dotted trails behind people who walk; the network learned to let go of history there and to keep thin window bars whole. People, the avatar, the flag and the aircraft also mark themselves in the scene buffer, and wherever one of them is in the sample window the upscaler clips its history fully and keeps a short memory, so a figure walking past a window stays solid instead of leaving a trail.
- **Rounded edges everywhere you can touch.** Walls, door and window frames, stairs, trim and furniture have real bevels of 4 to 8 mm, with hardened normals. Real edges are never perfectly sharp, and the thin line of light they catch is much of what makes a surface read as solid rather than drawn.
- **The sun through every window.** At load, the building is rendered once into a high-resolution static shadow map from the sun. The interior lightmaps hold sky light only, so this map is what lays real sun patches on the floors, desks and cases, with the shadow of every mullion. People and furniture are lit when they stand in a beam.
- **Light shafts and dust.** Each pixel marches the view ray through the same shadow map inside the building, and in-scatters sunlight with a forward-scattering phase function. The temporal filter converges the jittered march. Dust motes drift on slow currents and light up only where they cross a beam.
- **Fractal micro-detail.** Every baked surface carries three octaves of one fBm field (1.6 m, 43 cm and 10 cm), aligned to the world so it never stretches. The low octaves stain and mottle the albedo. All of them break up roughness, so polish, smudges and wear catch the light unevenly the way real floors and woodwork do. Their sum bumps the normal through screen-space derivatives. Strength follows each material's roughness, and the bump fades with distance before it can shimmer.
- **Probe lighting where a lightmap cannot be trusted.** Faces whose lightmap reads as noise, or, in maps that were not re-baked, whose texel density is far from their mesh's median (collapsed or stretched UV islands), blend to per-pixel light from the probe grid. The grid is built from each surface's own lightmap.
- **Baked global illumination, re-baked.** Every surface carries a lightmap path traced in Blender Cycles with three diffuse bounces. After bevelling, the interiors and furniture were unwrapped again and re-baked at 96 samples per texel (2048 px for the ground floor and trim). The building shell, outside walls and the inside faces of the outer walls, was re-baked at 384. The interior bakes hold sky light and every bounce, including the warm bounce of the sun off the floors; their direct sun is subtracted out, because the engine draws it itself, crisply, from the sun shadow map. Intel Open Image Denoise's lightmap filter cleans each map. The lamps in that bake now give out their physical output. Before, they were roughly a hundred times too bright and supplied 20 to 40 % of the indoor light; now, as in life, daylight does nearly all of it. A second filter then works in world space: every texel knows the point and facing of the surface it covers (rasterised from the exported model), and it is averaged with texels that are near it in the room and face the same way, with an edge stop on brightness. Leftover blotches go, nothing bleeds between charts that merely sit side by side in the atlas, and real light edges stay. The maps are stored with a square-root curve so dark rooms keep their precision.
- **Specular anti-aliasing.** Where the shading normal changes faster than a pixel can hold, the highlight widens instead of sparkling, so bevels, grain and polish stay stable in motion.
- **Contact ambient occlusion.** A golden-angle sampling pattern, rotated per pixel and per frame, adds the contact shadows that the lightmap is too coarse to hold.
- **Aerial perspective and sun rays.** Height-attenuated fog picks up the sun's forward scatter. Screen-space rays stream from the sun when it is in view.
- **Cloud shadows.** One drifting cloud field is projected along the sun onto everything it lights, indoors and out. When a cloud crosses the sun, the sun disc, the rays and the haze dim with it.
- **Eye adaptation.** The GPU meters the frame (centre-weighted log and linear averages) and adapts over time, faster to bright than to dark. A sunlit room or a view out of a window stops down the way a camera does.
- **Parallax occlusion mapping.** Brick, stone, roof tile, gravel and lawn have height fields. The view ray is marched through them per pixel, and a short ray toward the sun shadows the mortar joints.
- **Per-pixel relief on baked light.** The sun part of each lightmap texel is re-shaded through the surface normal with the exact Lambert ratio. The sky part gets cavity occlusion.
- **Real-time shadows for movers.** People, the avatar (even in first person) and the flag cast sun shadows from a small shadow map that follows the camera.
- **3D grass.** GPU-instanced tufts around the eye, placed from the surface map, lit from the light grid, bent by wind and pushed aside by feet.
- **Physically based materials** with roughness, metalness, sky reflections and macro variation that hides tiling.
- **Camera pipeline.** HDR, physically based bloom, the ACES filmic curve, contrast-adaptive sharpening, a gentle period grade, vignette and film grain. The bloom has no brightness threshold: like a real lens, it spreads a small, fixed share of all light (3.5 %) into a wide falloff, so it moves energy instead of adding it, and only things far brighter than their surroundings show a visible glow.
- **Lamps lit by physics, not sprites.** Each pendant is an opal-glass schoolhouse globe around a 200 W tungsten lamp (about 3,000 lm). The glass is lit by the inverse-square law with Lambert's cosine, transmits 55 %, scatters part of it forward (Henyey-Greenstein phase function), and loses some to Fresnel reflection at grazing angles, so the globe has a bright core and soft edges. The result is converted to scene units with the same sun calibration as everything else. There is no glow sprite; on a sunny afternoon a lit globe looks the way it would in a photograph, a few times brighter than the walls.
- **Reflections that know where they are.** Reflections of the sky are scaled by how much light actually reaches each spot (the baked irradiance over the sky probe's own irradiance), so polished floors deep inside a room no longer mirror a bright sky they cannot see.

## How it feels alive

- People walk their rounds, stop to talk to you, turn toward you and speak their lines in their own voices with 3D sound.
- A Curtiss JN-4 flies training passes over the field, and you hear its engine moving across the sky.
- Cloud shadows sweep across the court and through the rooms. Dust turns in the sunbeams. Grass bends under your feet and under everyone else's.
- **Sound that fits the space.** Sixteen acoustic rays are cast through the floor plan around you a few times a second. Their lengths, and how many escape through doors, set the mix of three synthetic rooms, so a small office, the long corridor and the open court each sound different. Birds call from the trees near you and are muffled behind glass. Wind rides the same gusts that bend the grass. People's footsteps follow their surface, hammering carries from the hangar line, an engine runs up somewhere on the field, and the passing aeroplane has real Doppler.
- The 48-star flag and the trees move in the wind. Footsteps change with the surface, and the ambience changes between the open field and the rooms.

## How it stays smooth

- **Fixed 120 Hz simulation with interpolation**, so motion is the same at any frame rate.
- **Closed-form physics.** Velocity, the eye-height spring on stairs, the landing dip, aircraft bank and the cloth wave are exact solutions, not step-size-dependent approximations.
- **Physics read from the textures.** The floor's material class sets grip, braking, pace and footstep sound.
- **Low latency.** The canvas is desynchronized, mouse look uses raw pointer input and touch look is applied on the event. Every shader compiles before the loading screen lifts.
- **A frame-time governor.** Frame time is the measured signal. Over budget, it first sheds optional passes (light shafts, then reflections, then contact shadows) and only then lowers render scale. Under budget, it restores resolution first. Add `?fps` to the address to see frame time, render scale and tier.
- **Only what can be seen is drawn.** Furniture and trim are split into 8 m cells per storey. A visibility bake rendered the walls, floors and shell from 3,929 eye points and stored, for every 4 m spot you can stand on, which cells can show through doors and windows (a potentially visible set). Cells, furniture instances, lamps and people outside that set are skipped before the GPU sees them, and the rest are frustum-culled and drawn front to back. In the corridor this cuts the triangles drawn per frame from 1.08 million to about 0.46 million, and in the laboratory from 1.02 to 0.40 million.
- **Cheaper people and grass.** People are drawn only when they are in view and in a visible cell; out of sight they animate at a quarter rate. Grass is generated only inside its disc, with three blades per cell near you and one wider blade further out, in eight sectors culled against the view, about a fifth of the vertex work it had.
- **Lean geometry.** Quantized, meshopt-compressed geometry and instanced furniture culled by floor, distance and view.
- **Phones get a lighter path.** Phones render 60 % of display resolution on each axis (36 % of the pixels, down from 72 % and 52 %), and the upscaler rebuilds the full resolution. They start with the optional passes off; the governor turns them on if the phone has headroom. Also a smaller sun shadow map, fewer dust motes and fewer relief steps.

## Run locally

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Opening `index.html` straight from the file system will not work, because browsers block file loading there.

Useful switches for comparison: `?night`, `?lamps`, `?nolamps`, `?oldssr` (the previous reflection pass), `?rrh` (the reflection reconstruction without its network), `?noprb` (no room probes), `?notsr` (the old path: anti-aliasing at render scale, then a stretch), `?tsrh` (the upscaler without its network), `?rs=0.5` (fixed render scale), `?notaa`, `?nossr`, `?nobias`, `?nopvs`, `?novol`, `?nodust`, `?noclouds`, `?noeye`, `?nossm`, `?nograss`, `?nopom`, `?noshadow`, `?nopost`.

## Deploy your own copy

```bash
export GITHUB_TOKEN=ghp_...   # a classic token with the repo scope
npm ci && npm run push
```

Needs Node 18 or newer and git. It checks the build, creates the repository if it does not exist, pushes on top of the existing history, sets GitHub Pages to deploy from the branch root, waits for the Pages build and prints the live address. The token is used for this run only and is never written to disk. Running it again only commits what changed.

## Honest limits

- There is no hardware ray tracing. WebGL has no access to ray-tracing hardware, and a software path tracer would not hold a smooth frame rate here. What is traced: the lightmaps and the lamp layer (path traced offline in Cycles), reflection rays against the depth buffer (Hi-Z), contact shadows and light shafts in screen space, rays through the sun and moon shadow map, and acoustic rays across the floor plan. A WebGPU path-traced mode is possible, but it would mean moving off three.js r128.
- Reflections can only trace what is on screen. Anything off screen comes from the room probe, which is captured from one point per room and does not hold people who walk past later.

- The sun does not move. Lighting is set for one clear afternoon in 1919, and night is one clear moonlit night. Day and night switch with a 4 second fade rather than a moving sun, and the moon sits where the sun was, so it can reuse the sun's shadow map.
- Sun patches indoors are real-time, but their bounce light is not, so a sunlit room does not get brighter overall the way it would in life.
- The temporal filter and the upscaler have no per-object motion vectors. Fast-moving people and dust can leave faint trails before the history clamps them, and at low render scales people in motion look softer than the room around them.
- The network in the upscaler is small. It was trained on 11 camera paths and scored on others, all in this building, at 640 x 360. Thin lines can still shimmer at the lowest render scales, and people in motion stay a little soft (the old path smeared them too). `?tsrh` shows the upscaler without its network for comparison; it ghosts behind walking people.
- The reflection network is small (16 inputs, 12 hidden units, 4 outputs) and was trained at 640 x 360 on paths through this building only. Mirror-like reflections of people walking past can still lag by a frame or two.
- The clouds in the sky panorama are still while their shadows move.
- People walk fixed routes. They stop, turn and talk, but they do not path-find. Voices are synthetic.
- Lightmap texels on the large walls are about 10 to 15 cm across. The filter hides their noise, but lighting detail finer than that comes from the runtime ambient occlusion and shadows, not from the bake.
- Furniture lightmaps are 1024 px (the shell, ground-floor rooms and trim are 2048), because larger furniture bakes did not fit the bake server's five-minute limit per job.
- The building has big windows on every side, so from most spots a large part of it really is visible: the visibility sets skip about a third of the furniture cells on average, more in inner rooms, less outdoors.
- The furniture models are generated from reference images of period equipment. They are not scans of the original objects.
- Frame rates on real GPUs have not been measured here. The development screenshots come from a software renderer.
- A browser is not a console AAA renderer. These techniques get close in look, not in scene complexity.

## Credits

Built with three.js r128 and meshoptimizer. Lightmaps baked in Blender Cycles. Textures, furniture models, figures and sound generated with Higgsfield. Building layout reconstructed from the 1919 plans of the Langley Field laboratory by Albert Kahn.

Code: MIT License. See `LICENSE`.
