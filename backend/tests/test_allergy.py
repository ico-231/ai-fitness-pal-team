"""Dị ứng thực phẩm: kiểm bằng code (không trông chờ AI tự nhớ) + gộp nhãn dụng cụ trùng."""
from app.services import allergy, exercises, foods

SEAFOOD = [{"note": "Dị ứng hải sản (tôm, cua)", "labels": ["hải sản"], "words": allergy._SEAFOOD}]


def test_seafood_flags_fish_shrimp_crab_but_not_chicken():
    flagged = allergy.flag_foods(SEAFOOD, foods.all_foods())
    assert "ca_hoi" in flagged and "canh_chua" in flagged and "bun_rieu" in flagged  # cá, cá, cua
    assert "pho_ga" not in flagged and "com_tam" not in flagged
    assert not allergy.matches(SEAFOOD, "Ức gà nướng mật ong. Giàu đạm")


def test_ca_is_whole_word_only():
    assert allergy.matches(SEAFOOD, "Canh chua cá lóc")
    assert not allergy.matches(SEAFOOD, "Cà phê sữa đá")  # cà ≠ cá
    assert not allergy.matches(SEAFOOD, "Kế hoạch cá nhân hoá")  # "cá nhân" không phải con cá


def test_band_aliases_merged():
    assert exercises.EQUIPMENT_ALIAS["resistance band"] == "band"
    items, total_band = exercises.search_exercises(equipment="band", limit=1)
    _, total_rb = exercises.search_exercises(equipment="resistance band", limit=1)
    assert total_band == total_rb and total_band > 0
