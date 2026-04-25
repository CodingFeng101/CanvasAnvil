<template>
  <div class="rich-text-base">
    <SelectGroup class="row">
      <Select
        style="width: 60%;"
        :value="richTextAttrs.fontname"
        search
        searchLabel="搜索字体"
        autofocus
        @update:value="value => emitRichTextCommand('fontname', value as string)"
        :options="FONTS"
      >
        <template #icon>
          <i-icon-park-outline:font-size />
        </template>
      </Select>
      <Select
        style="width: 40%;"
        :value="richTextAttrs.fontsize"
        search
        searchLabel="搜索字号"
        autofocus
        @update:value="value => emitRichTextCommand('fontsize', value as string)"
        :options="fontSizeOptions.map(item => ({
          label: item, value: item
        }))"
      >
        <template #icon>
          <i-icon-park-outline:add-text />
        </template>
      </Select>
    </SelectGroup>

    <ButtonGroup class="row" passive>
      <Popover trigger="click" style="width: 30%;">
        <template #content>
          <ColorPicker
            :modelValue="richTextAttrs.color"
            @update:modelValue="value => emitRichTextCommand('color', value)"
          />
        </template>
        <TextColorButton first v-tooltip="'文字颜色'" :color="richTextAttrs.color">
          <i-icon-park-outline:text />
        </TextColorButton>
      </Popover>
      <Popover trigger="click" style="width: 30%;">
        <template #content>
          <ColorPicker
            :modelValue="richTextAttrs.backcolor"
            @update:modelValue="value => emitRichTextCommand('backcolor', value)"
          />
        </template>
        <TextColorButton v-tooltip="'文字背景色'" :color="richTextAttrs.backcolor">
          <i-icon-park-outline:high-light />
        </TextColorButton>
      </Popover>
      <Button
        class="font-size-btn"
        style="width: 20%;"
        v-tooltip="'增大字号'"
        @click="emitRichTextCommand('fontsize-add')"
      ><i-icon-park-outline:font-size />+</Button>
      <Button
        last
        class="font-size-btn"
        style="width: 20%;"
        v-tooltip="'减小字号'"
        @click="emitRichTextCommand('fontsize-reduce')"
      ><i-icon-park-outline:font-size />-</Button>
    </ButtonGroup>

    <ButtonGroup class="row">
      <CheckboxButton
        style="flex: 1;"
        :checked="richTextAttrs.bold"
        v-tooltip="'加粗'"
        @click="emitRichTextCommand('bold')"
      ><i-icon-park-outline:text-bold /></CheckboxButton>
      <CheckboxButton
        style="flex: 1;"
        :checked="richTextAttrs.em"
        v-tooltip="'斜体'"
        @click="emitRichTextCommand('em')"
      ><i-icon-park-outline:text-italic /></CheckboxButton>
      <CheckboxButton
        style="flex: 1;"
        :checked="richTextAttrs.underline"
        v-tooltip="'下划线'"
        @click="emitRichTextCommand('underline')"
      ><i-icon-park-outline:text-underline /></CheckboxButton>
      <CheckboxButton
        style="flex: 1;"
        :checked="richTextAttrs.strikethrough"
        v-tooltip="'删除线'"
        @click="emitRichTextCommand('strikethrough')"
      ><i-icon-park-outline:strikethrough /></CheckboxButton>
    </ButtonGroup>

    <ButtonGroup class="row">
      <CheckboxButton
        style="flex: 1;"
        :checked="richTextAttrs.superscript"
        v-tooltip="'上标'"
        @click="emitRichTextCommand('superscript')"
      >A²</CheckboxButton>
      <CheckboxButton
        style="flex: 1;"
        :checked="richTextAttrs.subscript"
        v-tooltip="'下标'"
        @click="emitRichTextCommand('subscript')"
      >A₂</CheckboxButton>
      <CheckboxButton
        style="flex: 1;"
        :checked="richTextAttrs.code"
        v-tooltip="'代码块'"
        @click="emitRichTextCommand('code')"
      ><i-icon-park-outline:code /></CheckboxButton>
      <CheckboxButton
        style="flex: 1;"
        :checked="richTextAttrs.blockquote"
        v-tooltip="'引用'"
        @click="emitRichTextCommand('blockquote')"
      ><i-icon-park-outline:quote /></CheckboxButton>
    </ButtonGroup>

    <ButtonGroup class="row" passive>
      <CheckboxButton
        first
        style="flex: 1;"
        v-tooltip="'清除格式'"
        @click="emitRichTextCommand('clear')"
      ><i-icon-park-outline:format /></CheckboxButton>
      <CheckboxButton
        style="flex: 1;"
        :checked="!!textFormatPainter"
        v-tooltip="'格式刷（双击连续使用）'"
        @click="toggleTextFormatPainter()"
        @dblclick="toggleTextFormatPainter(true)"
      ><i-icon-park-outline:format-brush /></CheckboxButton>
      <Popover placement="bottom-end" trigger="click" v-model:value="linkPopoverVisible" style="width: 25%;">
        <template #content>
          <div class="link-popover">
            <Input v-model:value="link" placeholder="请输入超链接" />
            <div class="btns">
              <Button size="small" :disabled="!richTextAttrs.link" @click="removeLink()" style="margin-right: 5px;">移除</Button>
              <Button size="small" type="primary" @click="updateLink(link)">确认</Button>
            </div>
          </div>
        </template>
        <CheckboxButton
          last
          style="width: 100%;"
          :checked="!!richTextAttrs.link"
          v-tooltip="'超链接'"
          @click="openLinkPopover()"
        ><i-icon-park-outline:link-one /></CheckboxButton>
      </Popover>
    </ButtonGroup>
    <Divider />

    <RadioGroup
      class="row"
      button-style="solid"
      :value="richTextAttrs.align"
      @update:value="value => emitRichTextCommand('align', value)"
    >
      <RadioButton value="left" v-tooltip="'左对齐'" style="flex: 1;"><i-icon-park-outline:align-text-left /></RadioButton>
      <RadioButton value="center" v-tooltip="'居中对齐'" style="flex: 1;"><i-icon-park-outline:align-text-center /></RadioButton>
      <RadioButton value="right" v-tooltip="'右对齐'" style="flex: 1;"><i-icon-park-outline:align-text-right /></RadioButton>
      <RadioButton value="justify" v-tooltip="'两端对齐'" style="flex: 1;"><i-icon-park-outline:align-text-both /></RadioButton>
    </RadioGroup>

    <div class="row" passive>
      <ButtonGroup style="flex: 1;">
        <Button
          first
          :type="richTextAttrs.bulletList ? 'primary' : 'default'"
          style="flex: 1;"
          v-tooltip="'项目符号列表'"
          @click="emitRichTextCommand('bulletList')"
        ><i-icon-park-outline:list /></Button>
        <Popover trigger="click" v-model:value="bulletListPanelVisible">
          <template #content>
            <div class="list-wrap">
              <ul class="list"
                v-for="item in bulletListStyleTypeOption"
                :key="item"
                :style="{ listStyleType: item }"
                @click="emitRichTextCommand('bulletList', item)"
              >
                <li class="list-item" v-for="key in 3" :key="key"><span></span></li>
              </ul>
            </div>
          </template>
          <Button last class="popover-btn"><i-icon-park-outline:down /></Button>
        </Popover>
      </ButtonGroup>
      <div style="width: 10px;"></div>
      <ButtonGroup style="flex: 1;" passive>
        <Button
          first
          :type="richTextAttrs.orderedList ? 'primary' : 'default'"
          style="flex: 1;"
          v-tooltip="'有序列表'"
          @click="emitRichTextCommand('orderedList')"
        ><i-icon-park-outline:ordered-list /></Button>
        <Popover trigger="click" v-model:value="orderedListPanelVisible">
          <template #content>
            <div class="list-wrap">
              <ul class="list"
                v-for="item in orderedListStyleTypeOption"
                :key="item"
                :style="{ listStyleType: item }"
                @click="emitRichTextCommand('orderedList', item)"
              >
                <li class="list-item" v-for="key in 3" :key="key"><span></span></li>
              </ul>
            </div>
          </template>
          <Button last class="popover-btn"><i-icon-park-outline:down /></Button>
        </Popover>
      </ButtonGroup>
    </div>

    <div class="row">
      <ButtonGroup style="flex: 1;" passive>
        <Button first style="flex: 1;" v-tooltip="'减小段落缩进'" @click="emitRichTextCommand('indent', '-1')"><i-icon-park-outline:indent-left /></Button>
        <Popover trigger="click" v-model:value="indentLeftPanelVisible">
          <template #content>
            <PopoverMenuItem center @click="emitRichTextCommand('textIndent', '-1')">减小首行缩进</PopoverMenuItem>
          </template>
          <Button last class="popover-btn"><i-icon-park-outline:down /></Button>
        </Popover>
      </ButtonGroup>
      <div style="width: 10px;"></div>
      <ButtonGroup style="flex: 1;" passive>
        <Button first style="flex: 1;" v-tooltip="'增大段落缩进'" @click="emitRichTextCommand('indent', '+1')"><i-icon-park-outline:indent-right /></Button>
        <Popover trigger="click" v-model:value="indentRightPanelVisible">
          <template #content>
            <PopoverMenuItem center @click="emitRichTextCommand('textIndent', '+1')">增大首行缩进</PopoverMenuItem>
          </template>
          <Button last class="popover-btn"><i-icon-park-outline:down /></Button>
        </Popover>
      </ButtonGroup>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMainStore } from '@/store'
import emitter, { EmitterEvents } from '@/utils/emitter'
import { FONTS } from '@/configs/font'
import useTextFormatPainter from '@/hooks/useTextFormatPainter'
import message from '@/utils/message'

import TextColorButton from '@/components/TextColorButton.vue'
import CheckboxButton from '@/components/CheckboxButton.vue'
import ColorPicker from '@/components/ColorPicker/index.vue'
import Input from '@/components/Input.vue'
import Button from '@/components/Button.vue'
import ButtonGroup from '@/components/ButtonGroup.vue'
import Select from '@/components/Select.vue'
import SelectGroup from '@/components/SelectGroup.vue'
import Divider from '@/components/Divider.vue'
import Popover from '@/components/Popover.vue'
import RadioButton from '@/components/RadioButton.vue'
import RadioGroup from '@/components/RadioGroup.vue'
import PopoverMenuItem from '@/components/PopoverMenuItem.vue'

const { richTextAttrs, textFormatPainter } = storeToRefs(useMainStore())

const { toggleTextFormatPainter } = useTextFormatPainter()

const fontSizeOptions = [
  '12px', '14px', '16px', '18px', '20px', '22px', '24px', '28px', '32px',
  '36px', '40px', '44px', '48px', '54px', '60px', '66px', '72px', '76px',
  '80px', '88px', '96px', '104px', '112px', '120px',
]

const emitRichTextCommand = (command: string, value?: string) => {
  emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command, value } })
}

const bulletListPanelVisible = ref(false)
const orderedListPanelVisible = ref(false)
const indentLeftPanelVisible = ref(false)
const indentRightPanelVisible = ref(false)

const bulletListStyleTypeOption = ref(['disc', 'circle', 'square'])
const orderedListStyleTypeOption = ref(['decimal', 'lower-roman', 'upper-roman', 'lower-alpha', 'upper-alpha', 'lower-greek'])

const link = ref('')
const linkPopoverVisible = ref(false)

watch(richTextAttrs, () => linkPopoverVisible.value = false)

const openLinkPopover = () => {
  link.value = richTextAttrs.value.link
}
const updateLink = (link?: string) => {
  const linkRegExp = /^(https?):\/\/[\w\-]+(\.[\w\-]+)+([\w\-.,@?^=%&:\/~+#]*[\w\-@?^=%&\/~+#])?$/
  if (!link || !linkRegExp.test(link)) return message.error('不是正确的网页链接地址')

  emitRichTextCommand('link', link)
  linkPopoverVisible.value = false
}

const removeLink = () => {
  emitRichTextCommand('link')
  linkPopoverVisible.value = false
}
</script>

<style lang="scss" scoped>
.rich-text-base {
  user-select: none;
}
.row {
  width: 100%;
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
.font-size-btn {
  padding: 0;
}
.link-popover {
  width: 240px;

  .btns {
    margin-top: 10px;
    text-align: right;
  }
}
.list-wrap {
  width: 176px;
  color: #666;
  padding: 8px;
  margin: -12px;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
}
.list {
  background-color: $lightGray;
  padding: 4px 4px 4px 20px;
  cursor: pointer;

  &:not(:nth-child(3n)) {
    margin-right: 8px;
  }

  &:nth-child(4),
  &:nth-child(5),
  &:nth-child(6) {
    margin-top: 8px;
  }

  &:hover {
    color: $themeColor;

    span {
      background-color: $themeColor;
    }
  }
}
.list-item {
  width: 24px;
  height: 12px;
  position: relative;
  font-size: 10px;
  top: -2px;

  span {
    width: 100%;
    height: 2px;
    display: inline-block;
    position: absolute;
    top: 8px;
    background-color: #666;
  }
}
.popover-btn {
  padding: 0 3px;
}
</style>
