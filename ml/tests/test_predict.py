from ml.forecasting.predict import ARTIFACT_DIR, beats_baselines, institutional_prediction


def test_missing_artifact_and_demo_guard():
    assert institutional_prediction(ARTIFACT_DIR / "nonexistent-test-model.joblib", {"kitchen_key": "1"}, version="v1") is None
    assert institutional_prediction(ARTIFACT_DIR / "nonexistent-test-model.joblib", {"kitchen_key": "demo-1"}, version="v1") is None


def test_evaluation_requires_both_baselines():
    report = {"serving": {
        "ML": {"wape": 0.1}, "BASELINE": {"wape": 0.2}, "LOCAL_HISTORY": {"wape": 0.09},
    }}
    assert not beats_baselines(report, "serving")
    report["serving"]["LOCAL_HISTORY"]["wape"] = 0.12
    assert beats_baselines(report, "serving")
