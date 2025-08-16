import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from './AuthProvider'
import { LoginModal } from './LoginModal'
import { User, LogOut, Download, Upload } from 'lucide-react'

export const UserMenu: React.FC = () => {
  console.log('🔍 UserMenu rendering...')
  
  // Use auth with error boundary
  let user, signOut, loading
  try {
    const auth = useAuth()
    user = auth.user
    signOut = auth.signOut
    loading = auth.loading
    console.log('✅ UserMenu got auth context:', { user: user?.email, loading })
  } catch (error) {
    console.error('❌ UserMenu: Auth context not available yet:', error)
    return (
      <Button variant="outline" disabled className="flex items-center gap-2">
        <User size={16} />
        Auth Loading...
      </Button>
    )
  }
  
  const [showLoginModal, setShowLoginModal] = useState(false)
  
  // Show detailed state for debugging
  console.log('🎯 UserMenu current state:', { user: user?.email, loading, hasUser: !!user })

  // Temporarily bypass loading check to test the sign-in functionality
  // if (loading) {
  //   return (
  //     <Button variant="outline" disabled className="flex items-center gap-2">
  //       <User size={16} />
  //       Loading... ({loading ? 'true' : 'false'})
  //     </Button>
  //   )
  // }

  if (!user) {
    return (
      <>
        <Button 
          variant="outline" 
          onClick={() => setShowLoginModal(true)}
          className="flex items-center gap-2"
        >
          <User size={16} />
          Sign In
        </Button>
        <LoginModal 
          open={showLoginModal} 
          onOpenChange={setShowLoginModal} 
        />
      </>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <User size={16} />
          {user.email?.split('@')[0] || 'User'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled>
          <User className="mr-2 h-4 w-4" />
          {user.email}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => {/* TODO: Export user data */}}>
          <Download className="mr-2 h-4 w-4" />
          Export My Data
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {/* TODO: Import user data */}}>
          <Upload className="mr-2 h-4 w-4" />
          Import Data
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}