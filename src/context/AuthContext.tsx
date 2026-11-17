import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { ConditionType, DietType, NutrientTargets, RestrictionType, UserProfile } from '../types';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  emailVerified: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: () => Promise<boolean>;
  logout: () => Promise<void>;
  saveOnboarding: (data: {
    conditions: ConditionType[];
    dietType: DietType;
    restrictions: RestrictionType[];
    targets: NutrientTargets;
  }) => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
  refreshAdminStatus: () => Promise<void>;
  deleteAccountAndData: (reauthPassword?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function calculateInitialTargets(
  conditions: ConditionType[],
  restrictions: RestrictionType[]
): NutrientTargets {
  // Clinical baseline defaults tailored to condition combination
  const hasDiabetes = conditions.includes('diabetes');
  const hasHTN = conditions.includes('hypertension');
  const hasCKD = conditions.includes('ckd');

  let carbs = 180;
  let protein = 60;
  let sodium = 2000;
  let potassium = 2600;
  let fiber = 30;

  if (hasDiabetes) {
    carbs = 135;
    fiber = 35;
  }
  if (hasHTN || restrictions.includes('sodium')) {
    sodium = 1500;
  }
  if (hasCKD) {
    protein = 48; // Moderate protein pacing for renal preservation
    potassium = 2000;
    sodium = Math.min(sodium, 1600);
  }
  if (restrictions.includes('potassium')) {
    potassium = 1900;
  }
  if (restrictions.includes('added_sugar')) {
    carbs = Math.min(carbs, 130);
  }

  return { carbs, protein, sodium, potassium, fiber };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdminStatus = async (currentUser: FirebaseUser | null): Promise<boolean> => {
    if (!currentUser || !currentUser.emailVerified) {
      return false;
    }
    try {
      const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
      return adminDoc.exists();
    } catch {
      return false;
    }
  };

  const refreshVerificationStatus = async (): Promise<boolean> => {
    if (!auth.currentUser) {
      setEmailVerified(false);
      setIsAdmin(false);
      return false;
    }
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const verified = Boolean(auth.currentUser.emailVerified);
    setEmailVerified(verified);
    setUser(auth.currentUser);
    const adminState = await checkAdminStatus(auth.currentUser);
    setIsAdmin(adminState);
    return verified;
  };

  const refreshAdminStatus = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      setEmailVerified(Boolean(auth.currentUser.emailVerified));
      const adminState = await checkAdminStatus(auth.currentUser);
      setIsAdmin(adminState);
    } else {
      setEmailVerified(false);
      setIsAdmin(false);
    }
  };

  const fetchProfile = async (uid: string, currentUser: FirebaseUser) => {
    const userDocPath = `users/${uid}`;
    try {
      const docRef = doc(db, 'users', uid);
      const snapshot = await getDoc(docRef);

      if (snapshot.exists()) {
        setProfile(snapshot.data() as UserProfile);
      } else {
        const initialProfile: UserProfile = {
          uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Health Seeker',
          dietType: 'veg',
          conditions: [],
          restrictions: [],
          targets: {
            carbs: 180,
            protein: 60,
            sodium: 2000,
            potassium: 2600,
            fiber: 30,
          },
          onboardingComplete: false,
          createdAt: new Date().toISOString(),
        };
        setProfile(initialProfile);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, userDocPath);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      setUser(currentUser);
      setEmailVerified(Boolean(currentUser?.emailVerified));
      if (currentUser) {
        const isUserAdmin = await checkAdminStatus(currentUser);
        setIsAdmin(isUserAdmin);
        await fetchProfile(currentUser.uid, currentUser);
      } else {
        setIsAdmin(false);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const registerWithEmail = async (email: string, pass: string, name: string) => {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    if (res.user) {
      if (name) {
        await updateProfile(res.user, { displayName: name });
      }
      await sendEmailVerification(res.user);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('Not authenticated');
    await sendEmailVerification(auth.currentUser);
  };

  const logout = async () => {
    await signOut(auth);
    setEmailVerified(false);
    setIsAdmin(false);
    setProfile(null);
  };

  const saveOnboarding = async (data: {
    conditions: ConditionType[];
    dietType: DietType;
    restrictions: RestrictionType[];
    targets: NutrientTargets;
  }) => {
    if (!user) throw new Error('Not authenticated');
    const path = `users/${user.uid}`;
    const updatedProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'Health Seeker',
      dietType: data.dietType,
      conditions: data.conditions,
      restrictions: data.restrictions,
      targets: data.targets,
      onboardingComplete: true,
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'users', user.uid), updatedProfile, { merge: true });
      setProfile(updatedProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    if (!user) throw new Error('Not authenticated');
    const path = `users/${user.uid}`;
    const payload = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    try {
      await updateDoc(doc(db, 'users', user.uid), payload);
      setProfile(prev => (prev ? { ...prev, ...payload } : null));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const deleteAccountAndData = async (reauthPassword?: string): Promise<void> => {
    if (!user) throw new Error('No user logged in');
    const uid = user.uid;

    // Step 1: Re-authenticate if password provided or provider is google
    const isGoogleUser = user.providerData.some(p => p.providerId === 'google.com');

    // Attempt re-auth if password was provided
    if (reauthPassword && user.email) {
      const cred = EmailAuthProvider.credential(user.email, reauthPassword);
      await reauthenticateWithCredential(user, cred);
    } else if (isGoogleUser) {
      try {
        await reauthenticateWithPopup(user, googleProvider);
      } catch (e: any) {
        if (e.code === 'auth/popup-closed-by-user') {
          throw new Error('Google re-authentication cancelled.');
        }
      }
    }

    // Step 2: Delete subcollections of users/{uid}
    const subcollections = ['saved', 'searches', 'plans', 'meals'];
    for (const sub of subcollections) {
      const subColRef = collection(db, `users/${uid}/${sub}`);
      const snap = await getDocs(subColRef);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // Step 3: Delete users/{uid} root document
    await deleteDoc(doc(db, 'users', uid));

    // Step 4: Delete the Firebase Auth account
    try {
      await deleteUser(user);
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        throw new Error('RECENT_LOGIN_REQUIRED');
      }
      throw err;
    }

    // Reset local state
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        emailVerified,
        loading,
        signInWithGoogle,
        loginWithEmail,
        registerWithEmail,
        resetPassword,
        resendVerificationEmail,
        refreshVerificationStatus,
        logout,
        saveOnboarding,
        updateProfileData,
        refreshAdminStatus,
        deleteAccountAndData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
