#!/usr/bin/env bash
# The flake file list must come only from lines that open with a failure mark.
log=' ✓  unit  src/components/whatsapp-inbox/Composer.test.tsx > a send the server answered FAILED comes back 3ms
 ✓  unit  src/pages/reports/registry/salary.test.ts > sums hours × rate over the attended appointments 0ms
 ×  unit  tests/render/payment-step-sumit-grow-link.test.tsx > Back closes the open SUMIT link first 4021ms
 FAIL   unit  tests/integration/wa-inbox-ops-scripts.test.ts > runs the script
error: Test failed => ./supabase/functions/whatsapp-webhook/mediaMemory.test.ts:95:6'
line=$(grep -n 'ftests=\$(' "$HOME/nadavai/bin/ci-wait-wp" | head -1 | cut -d: -f1)
body=$(sed -n "${line},$((line+1))p" "$HOME/nadavai/bin/ci-wait-wp")
eval "$body"
expected=$'supabase/functions/whatsapp-webhook/mediaMemory.test.ts\ntests/integration/wa-inbox-ops-scripts.test.ts\ntests/render/payment-step-sumit-grow-link.test.tsx'
if [ "$ftests" = "$expected" ]; then echo PASS; else echo FAIL; printf '%s\n' "$ftests"; exit 1; fi
