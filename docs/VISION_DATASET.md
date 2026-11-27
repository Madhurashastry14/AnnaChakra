# Indian Food Images

The supplied local copy under `ml/datasets/vision/` has 80 class folders and 4,000 readable JPEG images. Each selected class had 50 readable images. The local copy has no identified release manifest or verified license. Confirm the original dataset release and terms before sharing images or derived artifacts.

| Class | Readable | Retained |
|---|---:|---:|
| aloo_gobi | 50 | 42 |
| biryani | 50 | 44 |
| chana_masala | 50 | 45 |
| chapati | 50 | 40 |
| dal_tadka | 50 | 41 |
| kuzhi_paniyaram | 50 | 45 |
| palak_paneer | 50 | 44 |
| poha | 50 | 44 |

Inspection reported 24 repeated exact decoded images across all classes, 55 non-exact candidate near-duplicate pairs among the selected classes, and no detected conflicting-label duplicate groups among the eight classes. The near-duplicate heuristic uses a 64-bit difference hash and Hamming distance at most three. It can merge distinct images or miss visually similar images. A single representative from each connected group remains before splitting.

Seed 42 produced 243 training, 54 validation, and 48 test images through per-class rounding. The ignored JSON reports contain dimensions, class counts, and the partition paths and digests. The dataset depicts prepared dishes rather than representative institutional leftovers and supplies no quantity, allergen, or safety ground truth.
