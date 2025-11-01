import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '../utils/apiClient';

interface CompanyInfo {
  id: number;
  company_name: string;
  company_name_kana_half?: string; // 会社名（読み・半角カナ）
  postal_code: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  representative: string;
  business_hours: string;
  established_date: string;
}

interface CompanyContextType {
  companyInfo: CompanyInfo | null;
  updateCompanyInfo: (info: CompanyInfo) => void;
  refreshCompanyInfo: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

interface CompanyProviderProps {
  children: ReactNode;
}

export const CompanyProvider: React.FC<CompanyProviderProps> = ({ children }) => {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

  const fetchCompanyInfo = async () => {
    try {
      const response = await apiClient.get<CompanyInfo>('/api/masters/company');
      if (response.data) {
        setCompanyInfo(response.data);
      }
    } catch (error) {
      console.error('会社情報の取得に失敗しました:', error);
    }
  };

  const updateCompanyInfo = (info: CompanyInfo) => {
    setCompanyInfo(info);
  };

  const refreshCompanyInfo = async () => {
    await fetchCompanyInfo();
  };

  useEffect(() => {
    fetchCompanyInfo();
  }, []);

  const value = {
    companyInfo,
    updateCompanyInfo,
    refreshCompanyInfo,
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
};