import Link from 'next/link'
import Hero from '../components/Hero'
import Features from '../components/Features'
import PricingTeaser from '../components/PricingTeaser'
import CTA from '../components/CTA'

export default function HomePage() {
  return (
    <>
      <Hero />
      <Features />
      <PricingTeaser />
      <CTA />
    </>
  )
}
