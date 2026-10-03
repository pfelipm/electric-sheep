<p align="center"><a href="https://pfelipm.github.io/electric-sheep/"><img src="docs/hero.gif" alt="Electric Sheep: logo con barras raster, scroller DYCP y ovejas en el borde abierto" width="768"></a></p>

# ELECTRIC SHEEP · una demo homenaje al Commodore 64

> *¿Sueñan los androides con ovejas eléctricas?*

**▶ Mírala (y, sobre todo, escúchala) aquí: https://pfelipm.github.io/electric-sheep/**

Una demo multiparte al estilo de la demoscene del C64, inspirada en la novela de Philip K. Dick y en *Blade Runner*, con una banda sonora original para SID que intenta llevar el espíritu de Vangelis a un chip de 1982. Todo hecho con **HTML, JavaScript y CSS, sin ninguna librería**.

## Las partes

![Seis momentos de la demo: la ciudad, el test Voight-Kampff, la oveja 3D, el plasma, la lluvia y el final contando ovejas](docs/gallery.png)

| # | Parte | Efectos |
|---|---|---|
| 0 | Arranque | Pantalla de BASIC V2, `LOAD`, *PRESS PLAY ON TAPE* y franjas de carga en el borde |
| 1 | Los Ángeles, noviembre de 2019 | Ciudad con *parallax*, pirámides, llamaradas sincronizadas con los timbales, *spinners*, lluvia |
| 2 | Título | Barras raster en el borde, logo con raster y ondulación, scroller DYCP, sprites en el borde "abierto" |
| 3 | Test Voight-Kampff | Ojo procedural cuya pupila late con la música, voz sintetizada, osciloscopio con la salida real del SID |
| 4 | Efectos "Amiga" | Oveja 3D de polígonos rellenos con rayos, plasma, rotozoom |
| 5 | Lágrimas en la lluvia | Monólogo, relámpagos y la paloma |
| 6 | Final | Ovejas saltando la valla (¡cuéntalas!), Zzz y scroller de saludos, en bucle |

## Controles

| Tecla | Acción |
|---|---|
| `ESPACIO` | Saltar a la siguiente parte |
| `R` | Reverb "Vangelis" / SID puro |
| `V` | Voz SAM (SID de 4 bits) / voz del navegador |
| `C` | Efecto CRT on/off |
| `F` | Pantalla completa |
| `M` | Silencio |

Puedes entrar directamente en una parte con `?part=N` (0-5), por ejemplo `?part=2`.

## Cómo funciona por dentro

- **SID virtual** ([js/sid.js](js/sid.js)): dos chips (6 voces) emulados en un `AudioWorklet`: acumulador de fase de 24 bits, triángulo, sierra, pulso con PWM, ruido LFSR de 23 bits, ondas combinadas, *ring mod*, *hard sync*, ADSR con la curva exponencial del chip y filtro resonante multimodo compartido por chip. Encima, un *player* tipo tracker a 50 Hz con wavetables, arpegios de acordes, vibrato, portamento y *hard restart*.
- **Banda sonora** ([js/song.js](js/song.js)): composición original escrita en un mini-lenguaje de tracker (`d5/8 ^e5/4 d4{0,3,7,12}/4 ...`).
- **Voz SAM** ([js/sam.js](js/sam.js)): como el *Software Automatic Mouth* de 1982. Pasa de texto a fonemas, aplica entonación, sintetiza por formantes y cuantiza a 4 bits. La voz se reproduce como "digi" a través del registro de volumen del SID, el mismo truco del original.
- **Gráficos** ([js/gfx.js](js/gfx.js), [js/parts.js](js/parts.js)): framebuffer de 384×272 (pantalla PAL con borde) con la paleta de 16 colores del C64, fuente 8×8 propia, sprites, *dithering* ordenado y fundidos por tabla. Todo es función del tiempo musical, así que audio y vídeo nunca se desincronizan.

No hace falta servidor: basta con abrir `index.html` en el navegador.

## Créditos

- **Idea y dirección:** Pablo Felip (aka NEXUS 10)
- **Código, gráficos y música SID:** Claude (Anthropic)

Saludos a Crest, Oxyron, Booze Design, Censor Design, Performers, Fairlight, Triad, Bonzai, Atlantis, Genesis Project, Maniacs of Noise… y a Rob Hubbard, Martin Galway, Ben Daglish, Jeroen Tel y Chris Hülsbeck.

*Blade Runner*, *Do Androids Dream of Electric Sheep?*, Commodore 64 y SAM pertenecen a sus respectivos titulares. Este es un homenaje sin ánimo de lucro: la música y los textos son originales.

## Licencia

[MIT](LICENSE)
