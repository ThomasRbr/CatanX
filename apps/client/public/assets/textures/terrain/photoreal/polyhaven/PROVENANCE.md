# CatanX Ultra terrain scan provenance

The 4K PBR maps in this directory are unmodified JPEG downloads from
[Poly Haven](https://polyhaven.com/), published under the
[CC0 licence](https://polyhaven.com/license).

| CatanX family | Poly Haven asset | Author shown by Poly Haven |
| --- | --- | --- |
| Meadow / pasture | [`leafy_grass`](https://polyhaven.com/a/leafy_grass) | Charlotte Baglioni |
| Forest floor | [`forrest_ground_03`](https://polyhaven.com/a/forrest_ground_03) | Rob Tuytel |
| Ochre clay | [`red_mud_stones`](https://polyhaven.com/a/red_mud_stones) | Rob Tuytel |
| Dune sand | [`sand_01`](https://polyhaven.com/a/sand_01) | Rob Tuytel |

For every asset, CatanX stores the 4K diffuse, OpenGL normal, roughness and
ambient-occlusion maps. The renderer loads them only for the `4k` texture tier;
lower profiles retain the smaller CatanX-authored maps. Mountain faces and
directional crop rows intentionally keep their CatanX-authored materials,
whose scale and structure better preserve those silhouettes.

Downloaded through the official Poly Haven API/CDN on 2026-07-22 with the
`CatanX-Asset-Pipeline/1.0` user agent.
