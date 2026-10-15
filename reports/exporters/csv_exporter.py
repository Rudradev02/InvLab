import csv
import io
from typing import Any, Iterable, List


def sanitize_csv_cell(value: Any) -> Any:
    """
    Prevent CSV formula injection (OWASP guidelines).
    Prefix cells starting with =, +, -, @, \\t, or \\r with a single quote.
    Preserve plain numbers (int, float, Decimal) without prepending quote if purely numeric.
    """
    if value is None:
        return ""

    if isinstance(value, (int, float)):
        return value

    str_val = str(value)
    if not str_val:
        return ""

    # Check if purely a standard numeric value like -12.34
    try:
        float(str_val)
        is_pure_number = True
    except ValueError:
        is_pure_number = False

    # If it starts with dangerous formula chars and is not a plain numeric float/int, sanitize
    if str_val[0] in ("=", "+", "-", "@", "\t", "\r"):
        if not is_pure_number:
            return "'" + str_val
        elif str_val[0] in ("=", "@", "+"):
            return "'" + str_val

    return str_val


class CSVStreamBuffer:
    """An object that implements just the write method for csv.writer."""
    def __init__(self):
        self._buffer = io.StringIO()

    def write(self, value):
        return self._buffer.write(value)

    def read_and_clear(self):
        content = self._buffer.getvalue()
        self._buffer.seek(0)
        self._buffer.truncate(0)
        return content


def stream_csv_rows(rows: Iterable[List[Any]]) -> Iterable[str]:
    """
    Generator that yields CSV rows one chunk at a time for StreamingHttpResponse.
    """
    buffer = CSVStreamBuffer()
    writer = csv.writer(buffer)

    for row in rows:
        sanitized_row = [sanitize_csv_cell(cell) for cell in row]
        writer.writerow(sanitized_row)
        yield buffer.read_and_clear()
