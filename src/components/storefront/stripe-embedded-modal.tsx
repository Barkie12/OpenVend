"use client";

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import Image from "next/image";
import { useEffect, useMemo, useRef } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const stripePromiseByKey = new Map<string, Promise<Stripe | null>>();

function stripePromise(publishableKey: string): Promise<Stripe | null> {
  let promise = stripePromiseByKey.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    stripePromiseByKey.set(publishableKey, promise);
  }
  return promise;
}

interface StripeEmbeddedModalProps {
  clientSecret: string;
  publishableKey: string;
  onComplete: () => void;
  onClose: () => void;
}

export function StripeEmbeddedModal({
  clientSecret,
  publishableKey,
  onComplete,
  onClose,
}: StripeEmbeddedModalProps) {
  // Stripe's provider requires referentially stable options; route the latest
  // callback through a ref so re-renders never change the options object.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  const checkoutOptions = useMemo(
    () => ({ clientSecret, onComplete: () => onCompleteRef.current() }),
    [clientSecret],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[88dvh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>Complete your payment</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            Processed securely by
            <Image
              src="/stripe-ar21.svg"
              alt="Stripe"
              width={120}
              height={60}
              className="-mx-3 h-8 w-auto"
            />
          </DialogDescription>
        </DialogHeader>
        {/* Stripe's embedded frame is light-themed; the white backdrop avoids a dark halo. */}
        <div className="rounded-b-lg bg-white p-2">
          <EmbeddedCheckoutProvider stripe={stripePromise(publishableKey)} options={checkoutOptions}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
