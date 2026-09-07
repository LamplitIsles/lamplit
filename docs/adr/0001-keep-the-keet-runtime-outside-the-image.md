# Keep the Keet runtime outside the image

Lamplit includes its Keet integration but does not redistribute the proprietary Keet Linux runtime in a released container image. Operators obtain the supported runtime themselves and mount it read-only, while the Partner's writable Keet identity remains separately persisted; this preserves the Keet capability without claiming redistribution rights that the current Keet terms do not grant.
