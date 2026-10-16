def number_to_words_inr(number: int) -> str:
    """
    Convert an integer to Indian numbering format in words (Lakh, Crore).
    Example: 125000 -> 'One Lakh Twenty Five Thousand'
    """
    if number == 0:
        return "Zero"

    units = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen",
    ]
    tens = [
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
    ]

    def two_digits(n: int) -> str:
        if n == 0:
            return ""
        if n < 20:
            return units[n]
        return tens[n // 10] + (" " + units[n % 10] if n % 10 else "")

    def three_digits(n: int) -> str:
        if n == 0:
            return ""
        h = n // 100
        rem = n % 100
        res = ""
        if h > 0:
            res += units[h] + " Hundred"
            if rem > 0:
                res += " and "
        if rem > 0:
            res += two_digits(rem)
        return res

    parts = []
    # Crores (10,000,000)
    crores = number // 10000000
    number %= 10000000
    if crores > 0:
        parts.append(number_to_words_inr(crores) + " Crore")

    # Lakhs (100,000)
    lakhs = number // 100000
    number %= 100000
    if lakhs > 0:
        parts.append(two_digits(lakhs) + " Lakh")

    # Thousands (1,000)
    thousands = number // 1000
    number %= 1000
    if thousands > 0:
        parts.append(two_digits(thousands) + " Thousand")

    # Hundreds and remainder
    if number > 0:
        parts.append(three_digits(number))

    return " ".join(parts).strip()


def amount_to_words_inr(amount) -> str:
    """
    Convert a Decimal or float amount to Indian currency words format.
    Example: 125000.50 -> 'One Lakh Twenty Five Thousand Rupees and Fifty Paise Only'
    """
    try:
        val = float(amount)
    except (ValueError, TypeError):
        return ""

    rupees = int(val)
    paise = int(round((val - rupees) * 100))

    rupees_str = number_to_words_inr(rupees) + (" Rupee" if rupees == 1 else " Rupees")
    if paise > 0:
        paise_str = number_to_words_inr(paise) + (" Paisa" if paise == 1 else " Paise")
        return f"{rupees_str} and {paise_str} Only"
    return f"{rupees_str} Only"
