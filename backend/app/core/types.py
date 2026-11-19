"""Shared request field types."""
from typing import Annotated

from pydantic import AfterValidator, EmailStr

# Emails are stored and compared in lower case, so "Aman@Company.com" and
# "aman@company.com" are the same account at sign-up, sign-in and reset.
NormalizedEmail = Annotated[EmailStr, AfterValidator(lambda v: v.strip().lower())]
