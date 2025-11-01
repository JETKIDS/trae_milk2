export function openCustomerStandalone(customerId: number) {
  const url = `${window.location.origin}/customers/${customerId}?view=standalone`;
  window.open(
    url,
    'customer-detail',
    'noopener,noreferrer,width=1080,height=720,scrollbars=yes,resizable=yes,location=no,menubar=no,toolbar=no,status=no,titlebar=no'
  );
}


