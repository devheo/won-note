import { useState, useCallback } from 'react';
import { TableRow, TreeItem } from '../types';

export type WorkspaceModalName =
  | 'dataPortability'
  | 'textPaste'
  | 'universalImport'
  | 'serverSettings'
  | 'commandPalette'
  | 'aiAgent'
  | 'prettyJson'
  | 'encodingConverter'
  | 'fileDiff'
  | 'formatExpress'
  | 'cryptoCodec'
  | 'postman'
  | 'calculator'
  | 'perfSettings'
  | 'sampleConfirm';

export function useWorkspaceModals() {
  const [activeModal, setActiveModal] = useState<WorkspaceModalName | null>(null);

  // Specific modal states with attached payloads
  const [editingRow, setEditingRow] = useState<TableRow | null>(null);
  const [editingTargetColId, setEditingTargetColId] = useState<string | null>(null);
  const [selectedDetailRow, setSelectedDetailRow] = useState<TableRow | null>(null);
  const [selectedDetailRowIndex, setSelectedDetailRowIndex] = useState<number>(0);
  const [treeItemToDelete, setTreeItemToDelete] = useState<TreeItem | null>(null);

  const openModal = useCallback((name: WorkspaceModalName) => {
    setActiveModal(name);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  const isModalOpen = useCallback(
    (name: WorkspaceModalName) => activeModal === name,
    [activeModal]
  );

  return {
    activeModal,
    openModal,
    closeModal,
    isModalOpen,

    editingRow,
    setEditingRow,
    editingTargetColId,
    setEditingTargetColId,
    selectedDetailRow,
    setSelectedDetailRow,
    selectedDetailRowIndex,
    setSelectedDetailRowIndex,
    treeItemToDelete,
    setTreeItemToDelete,
  };
}
