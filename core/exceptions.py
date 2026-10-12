import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class DomainError(Exception):
    """Base class for all business logic / domain errors."""

    def __init__(
        self,
        message: str,
        code: str = "domain_error",
        status_code: int = 400,
        fields: dict = None,
        details: dict = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.fields = fields or {}
        self.details = details or {}


class InsufficientStockError(DomainError):
    def __init__(self, message: str, details: dict = None, fields: dict = None):
        super().__init__(
            message=message,
            code="insufficient_stock",
            status_code=409,
            fields=fields,
            details=details,
        )


class ConflictError(DomainError):
    def __init__(self, message: str, code: str = "conflict", details: dict = None):
        super().__init__(message=message, code=code, status_code=409, details=details)


def custom_exception_handler(exc, context):
    """
    Standard error handler adhering to docs/API.md:
    {
      "error": {
        "code": "...",
        "message": "...",
        "fields": { ... },
        "details": { ... }
      }
    }
    """
    if isinstance(exc, DomainError):
        return Response(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "fields": exc.fields,
                    "details": exc.details,
                }
            },
            status=exc.status_code,
        )

    # Let DRF handle standard API exceptions
    response = exception_handler(exc, context)

    if response is not None:
        error_code = "error"
        fields = {}
        message = "An error occurred."

        if response.status_code == status.HTTP_400_BAD_REQUEST:
            error_code = "validation_error"
            message = "Validation error occurred."
            if isinstance(response.data, dict):
                fields = response.data
                # If there's a non_field_errors or detail message, use it
                if "detail" in response.data:
                    message = str(response.data["detail"])
                elif "non_field_errors" in response.data:
                    nfe = response.data["non_field_errors"]
                    message = str(nfe[0] if isinstance(nfe, list) and nfe else nfe)
            elif isinstance(response.data, list):
                fields = {"general": response.data}
                message = str(response.data[0]) if response.data else message
        elif response.status_code == status.HTTP_401_UNAUTHORIZED:
            error_code = "not_authenticated"
            message = (
                response.data.get("detail", "Authentication credentials were not provided.")
                if isinstance(response.data, dict)
                else "Not authenticated."
            )
        elif response.status_code == status.HTTP_403_FORBIDDEN:
            error_code = "permission_denied"
            message = (
                response.data.get("detail", "You do not have permission to perform this action.")
                if isinstance(response.data, dict)
                else "Permission denied."
            )
        elif response.status_code == status.HTTP_404_NOT_FOUND:
            error_code = "not_found"
            message = (
                response.data.get("detail", "Not found.")
                if isinstance(response.data, dict)
                else "Not found."
            )
        elif response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            error_code = "throttled"
            message = (
                response.data.get("detail", "Request was throttled.")
                if isinstance(response.data, dict)
                else "Throttled."
            )

        response.data = {
            "error": {
                "code": error_code,
                "message": message,
                "fields": fields,
                "details": {},
            }
        }
        return response

    # Unhandled 500 error
    logger.exception("Unhandled server exception: %s", exc)
    return Response(
        {
            "error": {
                "code": "server_error",
                "message": "Internal server error.",
                "fields": {},
                "details": {},
            }
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
