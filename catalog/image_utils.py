import io
import os
from PIL import Image
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile

MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB
ALLOWED_FORMATS = {"JPEG", "JPG", "PNG", "WEBP"}


def validate_product_image(file):
    """
    Validates uploaded product image:
    1. Maximum file size 2 MB
    2. Real image integrity verification using Pillow (protects against renamed malicious files)
    3. Allowed image formats: JPEG, PNG, WebP
    """
    if not file:
        return

    # Check file size
    if file.size > MAX_IMAGE_SIZE_BYTES:
        size_mb = file.size / (1024 * 1024)
        raise ValidationError(
            f"Image file size ({size_mb:.2f} MB) exceeds the 2 MB limit."
        )

    # Initial seek
    file.seek(0)

    try:
        # Verify file structure
        img = Image.open(file)
        img.verify()
    except Exception as exc:
        raise ValidationError(
            "The uploaded file is not a valid or readable image."
        ) from exc

    # verify() closes the file or leaves it at end; re-open for format check
    file.seek(0)
    try:
        img = Image.open(file)
        fmt = (img.format or "").upper()
        if fmt not in ALLOWED_FORMATS:
            raise ValidationError(
                f"Unsupported image format: '{fmt}'. Allowed formats are JPEG, PNG, and WebP."
            )

        # Check for image decompression bomb / excessive dimensions
        width, height = img.size
        if width > 8192 or height > 8192:
            raise ValidationError(
                f"Image dimensions ({width}x{height}) exceed maximum allowed dimensions (8192x8192)."
            )
        if width < 10 or height < 10:
            raise ValidationError(
                f"Image dimensions ({width}x{height}) are too small. Minimum is 10x10 pixels."
            )
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError(
            "Failed to process the uploaded image."
        ) from exc
    finally:
        file.seek(0)


def generate_thumbnail(image_file, size=(240, 240)) -> ContentFile:
    """
    Generates a proportional thumbnail from the uploaded image.
    Uses WebP format for fast web delivery and small payload.
    """
    image_file.seek(0)
    img = Image.open(image_file)

    # Convert modes to preserve quality
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        img = img.convert("RGBA")
        thumb_format = "WEBP"
    else:
        if img.mode != "RGB":
            img = img.convert("RGB")
        thumb_format = "WEBP"

    # Resize preserving aspect ratio with high quality lanczos filter
    img.thumbnail(size, Image.Resampling.LANCZOS)

    output = io.BytesIO()
    img.save(output, format=thumb_format, quality=85, method=6)
    output.seek(0)

    raw_name = getattr(image_file, "name", "product_thumb")
    base_name = os.path.splitext(os.path.basename(raw_name))[0]
    filename = f"thumb_{base_name}.webp"

    return ContentFile(output.read(), name=filename)


def safe_delete_storage_file(field_file):
    """
    Safely removes a file from its storage backend (local disk or Cloudinary).
    """
    if field_file and hasattr(field_file, "name") and field_file.name:
        try:
            field_file.storage.delete(field_file.name)
        except Exception:
            # Storage delete errors should not crash database operations
            pass
