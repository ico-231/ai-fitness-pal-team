// TỰ SINH bởi design-lab/bodymap-photo/build_app_assets.py — không sửa tay.
// Kích thước khung (px ảnh), trục giữa cơ thể và tâm từng nhóm cơ (để cắm ghim nhãn) của ảnh bản đồ cơ.
export const MUSCLE_ORDER = ["chest", "shoulders", "biceps", "triceps", "forearms", "abs", "obliques", "traps", "upper_back", "lats", "lower_back", "glutes", "quads", "hamstrings", "calves", "adductors"] as const;
export const BODYMAP_VIEWS = {
  "front": {
    "w": 438,
    "h": 732,
    "axis": 219,
    "muscles": [
      "chest",
      "shoulders",
      "biceps",
      "forearms",
      "abs",
      "obliques",
      "traps",
      "quads",
      "calves",
      "adductors"
    ],
    "centers": {
      "chest": [
        186.4,
        159.3
      ],
      "shoulders": [
        138.4,
        145.5
      ],
      "biceps": [
        122.1,
        205.6
      ],
      "forearms": [
        87.2,
        268.5
      ],
      "abs": [
        204.9,
        260.2
      ],
      "obliques": [
        174.2,
        253.0
      ],
      "traps": [
        183.4,
        111.8
      ],
      "quads": [
        168.2,
        419.3
      ],
      "calves": [
        163.9,
        569.4
      ],
      "adductors": [
        196.9,
        384.9
      ]
    }
  },
  "back": {
    "w": 439,
    "h": 732,
    "axis": 219,
    "muscles": [
      "shoulders",
      "triceps",
      "forearms",
      "obliques",
      "traps",
      "upper_back",
      "lats",
      "lower_back",
      "glutes",
      "hamstrings",
      "calves",
      "adductors"
    ],
    "centers": {
      "shoulders": [
        143.3,
        143.9
      ],
      "triceps": [
        122.7,
        204.9
      ],
      "forearms": [
        88.1,
        268.5
      ],
      "obliques": [
        170.6,
        281.7
      ],
      "traps": [
        202.7,
        140.5
      ],
      "upper_back": [
        177.1,
        171.8
      ],
      "lats": [
        182.0,
        231.3
      ],
      "lower_back": [
        204.5,
        284.3
      ],
      "glutes": [
        184.0,
        343.2
      ],
      "hamstrings": [
        171.4,
        437.4
      ],
      "calves": [
        162.2,
        565.2
      ],
      "adductors": [
        207.0,
        403.2
      ]
    }
  }
} as const;
