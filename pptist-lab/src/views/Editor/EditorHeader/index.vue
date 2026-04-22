<template>
  <div class="editor-header">
    <div class="left">
      <div class="menu-item return-entry" @click="handleReturnToCanvasAnvil()">
        <i-icon-park-outline:left class="icon" />
        <span class="label">返回</span>
      </div>
      <Divider type="vertical" :margin="8" />
      <Popover trigger="click" placement="bottom-start" v-model:value="mainMenuVisible">
        <template #content>
          <div class="import-section">
            <div class="import-label">导入文件</div>
            <div class="import-grid">
              <FileInput class="import-block" accept="application/vnd.openxmlformats-officedocument.presentationml.presentation" @change="files => {
                importPPTXFile(files)
                mainMenuVisible = false
              }">
                <span class="icon"><i-custom:file-ppt /></span>
                <span class="label">PPTX</span>
                <span class="sub-label">仅供测试</span>
              </FileInput>
              <FileInput class="import-block" accept=".json" @change="files => {
                importJSON(files)
                mainMenuVisible = false
              }">
                <span class="icon"><i-custom:file-jpg /></span>
                <span class="label">JSON</span>
                <span class="sub-label">仅供测试</span>
              </FileInput>
            </div>
          </div>
          <Divider :margin="10" />
          <PopoverMenuItem class="popover-menu-item" @click="handleReturnToCanvasAnvil()">
            <i-icon-park-outline:left class="icon" /> 返回
          </PopoverMenuItem>
          <Divider :margin="10" />
          <PopoverMenuItem class="popover-menu-item" @click="setDialogForExport('pptx')">
            <i-icon-park-outline:download class="icon" /> 导出文件
          </PopoverMenuItem>
          <Divider :margin="10" />
          <PopoverMenuItem class="popover-menu-item" @click="resetSlides(); mainMenuVisible = false">
            <i-icon-park-outline:refresh class="icon" /> 重置幻灯片
          </PopoverMenuItem>
          <PopoverMenuItem class="popover-menu-item" @click="openMarkupPanel(); mainMenuVisible = false">
            <i-icon-park-outline:mark class="icon" /> 幻灯片类型标注
          </PopoverMenuItem>
          <PopoverMenuItem class="popover-menu-item" @click="mainMenuVisible = false; hotkeyDrawerVisible = true">
            <i-icon-park-outline:command class="icon" /> 快捷操作
          </PopoverMenuItem>
          <Divider :margin="10" />
          <div class="statement">提示：本项目仅作演示和测试使用。</div>
        </template>
        <div class="menu-item"><i-icon-park-outline:hamburger-button class="icon" /></div>
      </Popover>

      <div class="title">
        <Input
          v-if="editingTitle"
          ref="titleInputRef"
          v-model:value="titleValue"
          class="title-input"
          @blur="handleUpdateTitle()"
        />
        <div
          v-else
          :title="title"
          class="title-text"
          @click="startEditTitle()"
        >
          {{ title }}
        </div>
      </div>
    </div>

    <div class="right">
      <div class="group-menu-item">
        <div class="menu-item" v-tooltip="'幻灯片放映（F5）'" @click="enterScreening()">
          <i-icon-park-outline:ppt class="icon" />
        </div>
        <Popover trigger="click" center>
          <template #content>
            <PopoverMenuItem class="popover-menu-item" @click="enterScreeningFromStart()">
              <i-icon-park-outline:slide-two class="icon" /> 从头开始
            </PopoverMenuItem>
            <PopoverMenuItem class="popover-menu-item" @click="enterScreening()">
              <i-icon-park-outline:ppt class="icon" /> 从当前页开始
            </PopoverMenuItem>
          </template>
          <div class="arrow-btn"><i-icon-park-outline:down class="arrow" /></div>
        </Popover>
      </div>
      <div class="menu-item" v-tooltip="'导出'" @click="setDialogForExport('pptx')">
        <i-icon-park-outline:download class="icon" />
      </div>
    </div>

    <Drawer
      v-model:visible="hotkeyDrawerVisible"
      :width="320"
      placement="right"
    >
      <HotkeyDoc />
      <template #title>快捷操作</template>
    </Drawer>

    <FullscreenSpin :loading="exporting" tip="正在导入..." />
  </div>
</template>

<script lang="ts" setup>
import { nextTick, ref, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useMainStore, useSlidesStore } from '@/store'
import useScreening from '@/hooks/useScreening'
import useImport from '@/hooks/useImport'
import useSlideHandler from '@/hooks/useSlideHandler'
import type { DialogForExportTypes } from '@/types/export'

import HotkeyDoc from './HotkeyDoc.vue'
import FileInput from '@/components/FileInput.vue'
import FullscreenSpin from '@/components/FullscreenSpin.vue'
import Drawer from '@/components/Drawer.vue'
import Input from '@/components/Input.vue'
import Popover from '@/components/Popover.vue'
import PopoverMenuItem from '@/components/PopoverMenuItem.vue'
import Divider from '@/components/Divider.vue'

const CANVASANVIL_APP_VIEW_STORAGE_KEY = 'CanvasAnvil-app-view-v1'
const CANVASANVIL_ACTIVE_WORKSPACE_STORAGE_KEY = 'CanvasAnvil-active-workspace-v1'
const CANVASANVIL_PPT_STAGE_STORAGE_KEY = 'CanvasAnvil-ppt-return-stage-v1'
const CANVASANVIL_PPT_RETURN_MESSAGE_TYPE = 'canvasanvil:ppt-return'

const mainStore = useMainStore()
const slidesStore = useSlidesStore()
const { title } = storeToRefs(slidesStore)
const { enterScreening, enterScreeningFromStart } = useScreening()
const { importPPTXFile, importJSON, exporting } = useImport()
const { resetSlides } = useSlideHandler()

const mainMenuVisible = ref(false)
const hotkeyDrawerVisible = ref(false)
const editingTitle = ref(false)
const titleValue = ref('')
const titleInputRef = useTemplateRef<InstanceType<typeof Input>>('titleInputRef')
const isEmbeddedCanvasAnvilMode = new URLSearchParams(window.location.search).get('canvasanvil') === 'embedded'

const getCanvasAnvilReturnUrl = () => {
  if (import.meta.env.MODE === 'development') {
    return 'http://127.0.0.1:5173/'
  }
  return '/'
}

const persistCanvasAnvilReturnTarget = () => {
  try {
    localStorage.setItem(CANVASANVIL_APP_VIEW_STORAGE_KEY, 'workspace')
    localStorage.setItem(CANVASANVIL_ACTIVE_WORKSPACE_STORAGE_KEY, 'ppt')
    localStorage.setItem(CANVASANVIL_PPT_STAGE_STORAGE_KEY, 'start')
  } catch {
  }
}

const handleReturnToCanvasAnvil = () => {
  mainMenuVisible.value = false
  if (isEmbeddedCanvasAnvilMode) {
    window.parent.postMessage(
      { type: CANVASANVIL_PPT_RETURN_MESSAGE_TYPE },
      `${window.location.protocol}//${window.location.hostname}:5173`
    )
    return
  }
  persistCanvasAnvilReturnTarget()
  if (window.opener && !window.opener.closed) {
    window.opener.focus()
    window.close()
    return
  }
  window.location.href = getCanvasAnvilReturnUrl()
}

const startEditTitle = () => {
  titleValue.value = title.value
  editingTitle.value = true
  nextTick(() => titleInputRef.value?.focus())
}

const handleUpdateTitle = () => {
  slidesStore.setTitle(titleValue.value)
  editingTitle.value = false
}

const setDialogForExport = (type: DialogForExportTypes) => {
  mainStore.setDialogForExport(type)
  mainMenuVisible.value = false
}

const openMarkupPanel = () => {
  mainStore.setMarkupPanelState(true)
}
</script>

<style lang="scss" scoped>
.editor-header {
  background-color: #fff;
  user-select: none;
  border-bottom: 1px solid $borderColor;
  display: flex;
  justify-content: space-between;
  padding: 0 5px;
}
.left,
.right {
  display: flex;
  justify-content: center;
  align-items: center;
}
.menu-item {
  height: 30px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 14px;
  padding: 0 10px;
  border-radius: $borderRadius;
  cursor: pointer;

  .icon {
    font-size: 18px;
    color: #666;
  }
  &:hover {
    background-color: #f1f1f1;
  }
}
.return-entry {
  gap: 6px;

  .label {
    color: #333;
    font-size: 12px;
    white-space: nowrap;
  }
}
.popover-menu-item {
  display: flex;
  padding: 8px 10px;

  .icon {
    font-size: 18px;
    margin-right: 10px;
  }
}
.statement {
  font-size: 12px;
  color: #999;
  padding: 8px 10px;
  font-style: italic;
}
.import-section {
  padding: 5px 0;

  .import-label {
    font-size: 12px;
    color: #999;
    margin-bottom: 6px;
  }
  .import-grid {
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }
  .import-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 8px;
    border-radius: $borderRadius;
    border: 1px solid $borderColor;
    transition: background-color .2s;
    cursor: pointer;

    &:hover {
      background-color: #f1f1f1;
    }
    .icon {
      font-size: 24px;
      margin-bottom: 2px;
    }
    .label {
      font-size: 12px;
      text-align: center;
    }
    .sub-label {
      font-size: 10px;
      color: #999;
    }
  }
}
.group-menu-item {
  height: 30px;
  display: flex;
  margin: 0 8px;
  padding: 0 2px;
  border-radius: $borderRadius;

  &:hover {
    background-color: #f1f1f1;
  }

  .menu-item {
    padding: 0 3px;
  }
  .arrow-btn {
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
  }
}
.title {
  height: 30px;
  margin-left: 2px;
  font-size: 13px;

  .title-input {
    width: 200px;
    height: 100%;
    padding-left: 0;
    padding-right: 0;

    ::v-deep(input) {
      height: 28px;
      line-height: 28px;
    }
  }
  .title-text {
    min-width: 20px;
    max-width: 400px;
    line-height: 30px;
    padding: 0 6px;
    border-radius: $borderRadius;
    cursor: pointer;

    @include ellipsis-oneline();

    &:hover {
      background-color: #f1f1f1;
    }
  }
}
</style>
