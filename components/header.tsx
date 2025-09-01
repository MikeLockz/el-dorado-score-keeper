"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"

export default function Header() {
  const pathname = usePathname()
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href)
  const itemBase = "rounded-sm text-sm outline-none focus:bg-accent focus:text-accent-foreground cursor-pointer px-2 py-1.5"
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-4xl px-3 h-12 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-wide">El Dorado</Link>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="outline" size="sm" aria-label="Open menu" className="h-8 px-2">
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" sideOffset={8} className="min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            <DropdownMenu.Item asChild className={cn(itemBase, isActive("/") && "bg-accent text-accent-foreground font-semibold")}>
              <Link href="/">Rounds</Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild className={cn(itemBase, isActive("/settings") && "bg-accent text-accent-foreground font-semibold")}>
              <Link href="/settings">Settings</Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item asChild className={cn(itemBase, isActive("/rules") && "bg-accent text-accent-foreground font-semibold")}>
              <Link href="/rules">Rules</Link>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
