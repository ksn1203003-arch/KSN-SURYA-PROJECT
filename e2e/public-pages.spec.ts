import { test, expect } from "@playwright/test"

// Regression coverage for: the public marketing pages originally showed
// fabricated adoption metrics ("500+ Schools", "50,000+ Students", "98%
// Satisfaction", "India's #1 CS Lesson Platform") and 9 fake named testimonials
// across HomePage/ForSchoolsPage/ForTeachersPage, plus copy that framed the
// whole product as CS-only when it's a general school-management platform.
// These tests guard against either regression reappearing.

test.describe("Public pages — no fabricated stats or testimonials", () => {
  test("HomePage shows no fabricated adoption numbers or superlative ranking claims", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("text=500+")).toHaveCount(0)
    await expect(page.locator("text=50,000+")).toHaveCount(0)
    await expect(page.locator("text=98%")).toHaveCount(0)
    await expect(page.locator("text=India's #1")).toHaveCount(0)
    await expect(page.locator("text=Join 500+ schools")).toHaveCount(0)

    // No fabricated named testimonials
    await expect(page.locator("text=Priya Sharma")).toHaveCount(0)
    await expect(page.locator("text=Rekha Kapoor")).toHaveCount(0)
    await expect(page.locator("text=Ramesh Iyer")).toHaveCount(0)

    // Honest replacement stats ARE present
    await expect(page.locator("text=User Roles")).toBeVisible()
    await expect(page.locator("text=Core Modules")).toBeVisible()

    // Repositioned copy: general platform first, CS as an add-on module
    await expect(page.locator("text=Attendance, marks, homework, quizzes, and certificates")).toBeVisible()
  })

  test("ForSchoolsPage shows no fabricated testimonials and leads with the general platform, not CS-only framing", async ({ page }) => {
    await page.goto("/for-schools")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("text=Mrs Anita Kapoor")).toHaveCount(0)
    await expect(page.locator("text=Mr Ramesh Pillai")).toHaveCount(0)
    await expect(page.locator("text=Mrs Sunita Bose")).toHaveCount(0)

    // Hero no longer claims the whole product IS "a Computer Science platform"
    await expect(page.locator("text=Run your whole school on one platform")).toBeVisible()

    // Honest "why founding schools choose us" section replaces fake testimonials
    await expect(page.locator("text=Why founding schools choose us")).toBeVisible()
  })

  test("ForTeachersPage shows no fabricated testimonials and leads with general admin relief, not \"become a CS teacher\"", async ({ page }) => {
    await page.goto("/for-teachers")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("text=Priya Sharma")).toHaveCount(0)
    await expect(page.locator("text=Ravi Kumar")).toHaveCount(0)
    await expect(page.locator("text=Meena Iyer")).toHaveCount(0)

    await expect(page.locator("text=Less admin, more teaching")).toBeVisible()
    await expect(page.locator("text=Why teachers choose us")).toBeVisible()
  })

  test("PricingPage FAQ frames CS curriculum as an add-on module, not the whole product", async ({ page }) => {
    await page.goto("/pricing")
    await page.waitForLoadState("networkidle")

    const faqQuestion = page.locator("text=Does this work for subjects other than Computer Science?")
    await expect(faqQuestion).toBeVisible()
    await faqQuestion.click()
    await page.waitForTimeout(300)
    await expect(page.locator("text=optional add-on")).toBeVisible()
  })
})
