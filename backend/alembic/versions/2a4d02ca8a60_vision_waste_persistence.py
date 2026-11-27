"""Persist private recognition references and conservative screening evidence."""
import sqlalchemy as sa
from alembic import op

revision = "2a4d02ca8a60"
down_revision = "f6fd216bdbc0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "vision_predictions",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("kitchen_id", sa.Integer(), sa.ForeignKey("kitchens.id"), nullable=False),
        sa.Column("image_format", sa.String(10), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_vision_predictions_kitchen_id", "vision_predictions", ["kitchen_id"])
    columns = (
        sa.Column("prediction_id", sa.String(32), nullable=True),
        sa.Column("model_version", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("safety_evidence", sa.JSON(), nullable=True),
        sa.Column("screening_reasons", sa.JSON(), nullable=True),
        sa.Column("screened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("safety_policy_version", sa.String(100), nullable=True),
    )
    for column in columns:
        op.add_column("waste_logs", column)
    op.create_foreign_key("fk_waste_vision_prediction", "waste_logs", "vision_predictions", ["prediction_id"], ["id"])
    op.create_index("ix_waste_logs_prediction_id", "waste_logs", ["prediction_id"])
    op.alter_column("waste_logs", "prepared_at", existing_type=sa.DateTime(timezone=True), nullable=True)


def downgrade():
    op.alter_column("waste_logs", "prepared_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.drop_index("ix_waste_logs_prediction_id", table_name="waste_logs")
    op.drop_constraint("fk_waste_vision_prediction", "waste_logs", type_="foreignkey")
    for name in ("prediction_id", "model_version", "notes", "safety_evidence", "screening_reasons",
                 "screened_at", "safety_policy_version"):
        op.drop_column("waste_logs", name)
    op.drop_index("ix_vision_predictions_kitchen_id", table_name="vision_predictions")
    op.drop_table("vision_predictions")
