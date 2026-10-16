from django.core.management.base import BaseCommand
from notifications.services import send_daily_summary_emails


class Command(BaseCommand):
    help = "Compile and send daily inventory and sales summary emails to warehouse managers and admins."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print summary without actually sending emails.",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Initiating daily summary email compilation..."))

        dry_run = options.get("dry_run", False)
        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run specified; email dispatch skipped."))
            return

        sent_count = send_daily_summary_emails()
        self.stdout.write(
            self.style.SUCCESS(f"Daily summary process completed. {sent_count} email(s) dispatched.")
        )
