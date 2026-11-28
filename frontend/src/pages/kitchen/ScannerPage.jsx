import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  CircleHelp,
  Info,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";
import { listFoodItems } from "../../services/foodItems.js";
import { countPrediction, predictFoodImage } from "../../services/vision.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  formatNumber,
  isWholeNumber,
  labelFor,
  unitLabel,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { FormError, FormGrid, TextInput } from "../../components/ui/Form.jsx";
import { EmptyState, LoadingSkeleton } from "../../components/ui/States.jsx";
import AuthenticatedImage from "../../components/ui/AuthenticatedImage.jsx";
import ImageUploader from "../../components/kitchen/ImageUploader.jsx";
import { FoodSelect } from "../../components/kitchen/FoodSelectors.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function countingTone(status) {
  if (status === "ESTIMATED") return "success";
  if (status === "UNSUPPORTED_FOOD" || status === "UNSUITABLE_IMAGE") return "warning";
  if (status === "DETECTION_FAILED") return "danger";
  return "neutral";
}

function BoxOverlay({ boxes }) {
  if (!boxes?.length) return null;
  return (
    <div className="k-box-overlay" aria-hidden="true">
      {boxes.map((box, index) => {
        const [x, y, width, height] = box;
        return (
          <span
            key={`${x}-${y}-${index}`}
            className="k-box"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${width * 100}%`,
              height: `${height * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
}

export default function ScannerPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const resultRef = useRef(null);
  const [foods, setFoods] = useState(null);
  const [foodsError, setFoodsError] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileError, setFileError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [result, setResult] = useState(null);
  const [countData, setCountData] = useState(null);
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState("");
  const [recounting, setRecounting] = useState(false);

  useEffect(() => {
    let active = true;
    listFoodItems({ limit: 100 })
      .then((data) => {
        if (active) setFoods(data.items ?? []);
      })
      .catch((error) => {
        if (active) setFoodsError(getErrorMessage(error, "We couldn’t load the food catalogue."));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const selectedFood = useMemo(
    () => (foods ?? []).find((food) => String(food.id) === String(selectedFoodId)) ?? null,
    [foods, selectedFoodId],
  );

  const automaticCount = selectedFoodId && String(result?.count_food_item_id) === selectedFoodId
    ? result
    : null;
  const selectedCount = countData ?? automaticCount;
  const boxes = selectedCount?.boxes ?? [];
  const showBoxes = boxes.length > 0;
  const countingStatus = selectedCount?.counting_status;
  const countingMethod = selectedCount?.counting_method;
  const countingWarnings = selectedCount?.counting_warnings ?? [];

  function handleFileSelected(nextFile) {
    setFileError("");
    setScanError("");
    setActionError("");
    if (!nextFile) return;
    if (!ALLOWED_TYPES.includes(nextFile.type)) {
      setFileError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (nextFile.size > MAX_BYTES) {
      setFileError("The image must be 5 MiB or smaller.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setResult(null);
    setCountData(null);
    setSelectedFoodId("");
    setQuantity("");
    setNotes("");
  }

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl("");
    setFileError("");
    setScanError("");
    setActionError("");
    setResult(null);
    setCountData(null);
    setSelectedFoodId("");
    setQuantity("");
    setNotes("");
  }

  async function handleScan() {
    if (!file) {
      setFileError("Choose an image to scan.");
      return;
    }
    setScanning(true);
    setScanError("");
    setActionError("");
    setResult(null);
    setCountData(null);
    setSelectedFoodId("");
    setQuantity("");
    try {
      const data = await predictFoodImage(file);
      setResult(data);
      notify("Image analysed. Select the food shown in the photo.");
    } catch (error) {
      setScanError(getErrorMessage(error, "We couldn’t analyse this image."));
    } finally {
      setScanning(false);
    }
  }

  function handleFoodChange(value) {
    setSelectedFoodId(value);
    setCountData(null);
    setQuantity("");
    setActionError("");
  }

  async function handleRecount() {
    if (!result?.prediction_id || !selectedFoodId) {
      setActionError("Select the food in the image before recounting.");
      return;
    }
    setRecounting(true);
    setActionError("");
    try {
      const data = await countPrediction(result.prediction_id, Number(selectedFoodId));
      setCountData(data);
      if (data.counting_status === "ESTIMATED") {
        notify("Count estimated for the selected food. Confirm the quantity before logging.");
      }
    } catch (error) {
      setActionError(getErrorMessage(error, "We couldn’t recount this image."));
    } finally {
      setRecounting(false);
    }
  }

  function handoffToWaste() {
    const amount = Number(quantity);
    if (!selectedFoodId) {
      setActionError("Choose the food item before continuing.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError("Enter a quantity greater than zero.");
      return;
    }
    if (selectedFood?.serving_unit === "piece" && !isWholeNumber(amount)) {
      setActionError("Piece-based quantities must be whole numbers.");
      return;
    }
    navigate("/kitchen/waste-logs/new", {
      state: {
        mode: "scanner",
        prediction_id: result.prediction_id,
        food_item_id: Number(selectedFoodId),
        confirmed_servings: amount,
        food_name: selectedFood?.name,
        serving_unit: selectedFood?.serving_unit,
        notes,
      },
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS"
        title="AI food scanner"
        description="Photograph food to get a classification suggestion and, where supported, an experimental piece count. Always review and confirm before logging waste."
        actions={
          <Button variant="secondary" to="/kitchen/waste-logs" icon={Trash2}>
            Leftover logs
          </Button>
        }
      />

      <div className="k-scanner-layout">
        <Card>
          <CardHeader
            icon={Camera}
            title="Add an image"
            subtitle="JPEG, PNG or WebP up to 5 MiB. Photos stay private to your kitchen."
          />
          <div className="k-card-body">
            <ImageUploader
              file={file}
              previewUrl={previewUrl}
              onFileSelected={handleFileSelected}
              onClear={clearImage}
              error={fileError}
              disabled={scanning || recounting}
            />
            <div className="k-form-actions">
              <Button
                icon={ScanLine}
                onClick={handleScan}
                loading={scanning}
                disabled={!file || Boolean(fileError) || recounting}
              >
                Analyse image
              </Button>
              {result ? (
                <Button variant="secondary" icon={RotateCcw} onClick={clearImage} disabled={scanning || recounting}>
                  Start over
                </Button>
              ) : null}
            </div>
            <FormError message={scanError} />
            {foodsError ? <FormError message={foodsError} /> : null}
            <p className="k-note">
              <Info size={14} aria-hidden="true" />
              The scanner is a decision aid. It does not decide whether food is safe, and a
              classification score is not a food-safety confidence score.
            </p>
          </div>
        </Card>

        <aside className="k-planner-aside">
          <section className="k-planner-info">
            <span className="k-info-icon" aria-hidden="true"><Sparkles size={19} /></span>
            <h2>What the scanner returns</h2>
            <p>
              A predicted food, the model’s classification confidence, alternative labels, and
              a counting status. Piece counts are experimental and need confirmation.
            </p>
          </section>
          <section className="k-planner-info">
            <span className="k-info-icon" aria-hidden="true"><ShieldAlert size={19} /></span>
            <h2>Safety stays separate</h2>
            <p>
              Redistribution eligibility is screened from the food-safety facts you record in
              the leftover log. The scanner never marks food safe or unsafe.
            </p>
          </section>
          <section className="k-planner-info">
            <span className="k-info-icon" aria-hidden="true"><CircleHelp size={19} /></span>
            <h2>If the prediction is wrong</h2>
            <p>
              Choose the correct catalogue item, then recount. If automatic counting is not
              supported, enter the quantity yourself.
            </p>
          </section>
        </aside>
      </div>

      {scanning ? <LoadingSkeleton rows={6} /> : null}

      {result ? (
        <div ref={resultRef} className="k-scanner-result">
          <div className="k-section-heading-row">
            <div>
              <p className="k-eyebrow">SCAN RESULT</p>
              <h2>Review before logging</h2>
            </div>
            {countingStatus ? <Badge tone={countingTone(countingStatus)}>{labelFor(countingStatus)}</Badge> : null}
          </div>

          <div className="k-scanner-result-grid">
            <Card>
              <CardHeader icon={ScanLine} title="Image and detected pieces" />
              <div className="k-card-body">
                <div className="k-scanner-image-wrap">
                  <AuthenticatedImage
                    src={`/api/v1/vision/images/${result.prediction_id}`}
                    alt="Scanned food"
                    className="k-scanner-image"
                  />
                  {showBoxes ? <BoxOverlay boxes={boxes} /> : null}
                </div>
                {showBoxes ? (
                  <p className="k-note">
                    <Info size={14} aria-hidden="true" />
                    Boxes show visible pieces only. Confirm the quantity against what is actually
                    there.
                  </p>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader icon={Utensils} title="Food suggestions" subtitle="The model recognizes a limited set of dishes. Choose the actual food from the catalogue if it is missing from the suggestions." />
              <div className="k-card-body">
                <dl className="k-detail-grid">
                  <div>
                    <dt>Predicted food</dt>
                    <dd>{result.predicted_food ?? "No confident match"}</dd>
                  </div>
                  <div>
                    <dt>Classification confidence</dt>
                    <dd>
                      {result.confidence === null || result.confidence === undefined
                        ? "—"
                        : `${(Number(result.confidence) * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Serving unit</dt>
                    <dd>{result.serving_unit ? unitLabel(result.serving_unit) : "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Model version</dt>
                    <dd>{result.model_version ?? "Not reported"}</dd>
                  </div>
                  <div>
                    <dt>Counting method</dt>
                    <dd>{countingMethod ? labelFor(countingMethod) : "Not attempted"}</dd>
                  </div>
                  <div>
                    <dt>Estimated quantity</dt>
                    <dd>
                      {selectedCount?.estimated_servings == null
                        ? "Not estimated"
                        : formatNumber(selectedCount.estimated_servings)}
                    </dd>
                  </div>
                </dl>

                {result.warnings?.length > 0 ? (
                  <div className="k-warning-list">
                    {result.warnings.map((warning, index) => (
                      <p key={`${warning}-${index}`}>{warning}</p>
                    ))}
                  </div>
                ) : null}

                {countingWarnings.length > 0 ? (
                  <div className="k-callout k-callout-warning">
                    <ShieldAlert size={16} aria-hidden="true" />
                    <div>
                      <strong>Counting notes</strong>
                      <ul>
                        {countingWarnings.map((warning, index) => (
                          <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}

                {result.top_predictions?.length > 0 ? (
                  <div className="k-top-predictions">
                    <h3>Choose a suggestion</h3>
                    {result.top_predictions.map((prediction, index) => (
                      <button
                        type="button"
                        key={`${prediction.label}-${index}`}
                        className="k-top-prediction"
                        onClick={() => {
                          if (prediction.food_item_id) {
                            handleFoodChange(String(prediction.food_item_id));
                          }
                        }}
                        disabled={!prediction.food_item_id || recounting}
                      >
                        <span>
                          <strong>{prediction.food || prediction.label}</strong>
                          <small>
                            {prediction.serving_unit ? unitLabel(prediction.serving_unit) : "Unit unknown"}
                          </small>
                        </span>
                        <Badge tone="outline">{(Number(prediction.confidence) * 100).toFixed(1)}%</Badge>
                      </button>
                    ))}
                    <p className="k-hint">
                      You can also select a food from the catalogue below.
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              icon={Sparkles}
              title="Select food and confirm quantity"
              subtitle="Automatic counts are experimental. Enter the quantity you can stand behind."
            />
            <div className="k-card-body k-form">
              <FormGrid columns={2}>
                <FoodSelect
                  foods={foods}
                  value={selectedFoodId}
                  onChange={handleFoodChange}
                  label="Food item"
                  required
                  disabled={recounting}
                  hint="Select the food you see in the photo."
                />
                <TextInput
                  label={`Confirmed quantity${selectedFood ? ` (${unitLabel(selectedFood.serving_unit)})` : ""}`}
                  type="number"
                  min="0"
                  step={selectedFood?.serving_unit === "piece" ? "1" : "0.01"}
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setActionError("");
                  }}
                  required
                  hint={
                    selectedFood?.serving_unit === "piece"
                      ? "Whole pieces only."
                      : "Use the quantity you measured or counted."
                  }
                />
              </FormGrid>

              <div className="k-form-actions">
                <Button
                  variant="secondary"
                  icon={RotateCcw}
                  onClick={handleRecount}
                  loading={recounting}
                  disabled={!selectedFoodId || !result.prediction_id}
                >
                  Recount selected food
                </Button>
                <Button icon={ArrowRight} onClick={handoffToWaste} disabled={!selectedFoodId || recounting}>
                  Continue to leftover log
                </Button>
                <Button variant="ghost" onClick={clearImage} disabled={recounting}>
                  Discard scan
                </Button>
              </div>
              <FormError message={actionError} />

              <p className="k-note">
                <Info size={14} aria-hidden="true" />
                The leftover log will ask for food-safety facts separately. Nothing is logged until
                you submit that form.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {!result && !scanning ? (
        <EmptyState
          icon={ScanLine}
          title="No scan yet"
          description="Add a photo and analyse it to see the prediction, counting status and quantity confirmation."
          action={
            <Link className="k-text-link" to="/kitchen/waste-logs/new">
              Or log leftovers manually
            </Link>
          }
        />
      ) : null}
    </>
  );
}
