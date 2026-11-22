//go:build windows && (amd64 || arm64)

package desktop

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"
)

// UI Automation through its COM vtables. Indexes follow UIAutomationClient.h;
// every interface starts with IUnknown's QueryInterface, AddRef and Release.
const (
	vtRelease = 2

	uiaElementFromHandle    = 6
	uiaControlViewCondition = 18
	uiaCreateCacheRequest   = 20
	cacheAddProperty        = 3
	elemFindAllBuildCache   = 8
	elemGetCachedProperty   = 12
	elemCachedControlType   = 53
	elemCachedName          = 55
	elemCachedHasFocus      = 58
	elemCachedIsEnabled     = 60
	elemCachedIsPassword    = 67
	elemCachedIsOffscreen   = 70
	elemCachedBoundingRect  = 75
	arrayLength             = 3
	arrayGetElement         = 4
	treeScopeDescendants    = 4
	propBoundingRectangle   = 30001
	propControlType         = 30003
	propName                = 30005
	propHasKeyboardFocus    = 30008
	propIsEnabled           = 30010
	propIsPassword          = 30019
	propIsOffscreen         = 30022
	propValueValue          = 30045
	vtBSTR                  = 8
	clsctxInprocServer      = 1
)

var (
	clsidCUIAutomation = syscall.GUID{Data1: 0xff48dba4, Data2: 0x60ef, Data3: 0x4201, Data4: [8]byte{0xaa, 0x87, 0x54, 0x10, 0x3e, 0xef, 0x59, 0x4e}}
	iidIUIAutomation   = syscall.GUID{Data1: 0x30cbe57d, Data2: 0xd9d0, Data3: 0x452a, Data4: [8]byte{0xab, 0x13, 0x7a, 0xc5, 0xac, 0x48, 0x25, 0xee}}
)

var roleNames = map[int32]string{
	50000: "button", 50001: "calendar", 50002: "checkbox", 50003: "combobox", 50004: "edit",
	50005: "link", 50006: "image", 50007: "listitem", 50008: "list", 50009: "menu",
	50010: "menubar", 50011: "menuitem", 50012: "progressbar", 50013: "radio", 50014: "scrollbar",
	50015: "slider", 50016: "spinner", 50017: "statusbar", 50018: "tab", 50019: "tabitem",
	50020: "text", 50021: "toolbar", 50022: "tooltip", 50023: "tree", 50024: "treeitem",
	50025: "custom", 50026: "group", 50027: "thumb", 50028: "grid", 50029: "dataitem",
	50030: "document", 50031: "splitbutton", 50032: "window", 50033: "pane", 50034: "header",
	50035: "headeritem", 50036: "table", 50037: "titlebar", 50038: "separator",
}

// Containers that only add noise unless they carry a name.
var quietRoles = map[string]bool{"pane": true, "group": true, "custom": true, "separator": true, "thumb": true, "scrollbar": true, "titlebar": true}

type variant struct {
	VT       uint16
	Reserved [3]uint16
	Value    uintptr
	Extra    uintptr
}

// comCall calls method index of a COM object. Out parameters must be
// heap-allocated (new) so they cannot move during the call.
//
//go:uintptrescapes
func comCall(object uintptr, index int, args ...uintptr) error {
	table := *(*uintptr)(at(object))
	method := *(*uintptr)(at(table + uintptr(index)*unsafe.Sizeof(uintptr(0))))
	hr, _, _ := syscall.SyscallN(method, append([]uintptr{object}, args...)...)
	if int32(hr) < 0 {
		return fmt.Errorf("UI Automation call %d failed: 0x%08x", index, uint32(hr))
	}
	return nil
}

func release(object uintptr) {
	if object != 0 {
		comCall(object, vtRelease)
	}
}

func bstr(value uintptr) string {
	if value == 0 {
		return ""
	}
	n, _, _ := procSysStringLen.Call(value)
	s := syscall.UTF16ToString(unsafe.Slice((*uint16)(at(value)), int(n)))
	procSysFreeString.Call(value)
	return s
}

type uiAutomation struct{ object uintptr }

// elements runs on the worker thread.
func (u *uiAutomation) elements(hwnd uintptr, limit int) ([]Element, bool, error) {
	if u.object == 0 {
		object := new(uintptr)
		hr, _, _ := procCoCreateInstance.Call(uintptr(unsafe.Pointer(&clsidCUIAutomation)), 0, clsctxInprocServer, uintptr(unsafe.Pointer(&iidIUIAutomation)), uintptr(unsafe.Pointer(object)))
		if int32(hr) < 0 || *object == 0 {
			return nil, false, errors.New("UI Automation is not available")
		}
		u.object = *object
	}
	root := new(uintptr)
	if err := comCall(u.object, uiaElementFromHandle, hwnd, uintptr(unsafe.Pointer(root))); err != nil || *root == 0 {
		return nil, false, errors.New("could not read the window's controls")
	}
	defer release(*root)
	condition := new(uintptr)
	if err := comCall(u.object, uiaControlViewCondition, uintptr(unsafe.Pointer(condition))); err != nil {
		return nil, false, err
	}
	defer release(*condition)
	request := new(uintptr)
	if err := comCall(u.object, uiaCreateCacheRequest, uintptr(unsafe.Pointer(request))); err != nil {
		return nil, false, err
	}
	defer release(*request)
	for _, property := range []uintptr{propBoundingRectangle, propControlType, propName, propHasKeyboardFocus, propIsEnabled, propIsPassword, propIsOffscreen, propValueValue} {
		if err := comCall(*request, cacheAddProperty, property); err != nil {
			return nil, false, err
		}
	}
	found := new(uintptr)
	if err := comCall(*root, elemFindAllBuildCache, treeScopeDescendants, *condition, *request, uintptr(unsafe.Pointer(found))); err != nil || *found == 0 {
		return nil, false, errors.New("could not read the window's controls")
	}
	defer release(*found)
	count := new(int32)
	if err := comCall(*found, arrayLength, uintptr(unsafe.Pointer(count))); err != nil {
		return nil, false, err
	}
	out := []Element{}
	for i := 0; i < int(*count); i++ {
		element := new(uintptr)
		if comCall(*found, arrayGetElement, uintptr(i), uintptr(unsafe.Pointer(element))) != nil || *element == 0 {
			continue
		}
		e, keep := readElement(*element)
		release(*element)
		if !keep {
			continue
		}
		if len(out) == limit {
			return out, true, nil
		}
		out = append(out, e)
	}
	return out, false, nil
}

func readElement(element uintptr) (Element, bool) {
	offscreen, password, enabled, focused := new(int32), new(int32), new(int32), new(int32)
	controlType := new(int32)
	name := new(uintptr)
	bounds := new(winRect)
	if comCall(element, elemCachedIsOffscreen, uintptr(unsafe.Pointer(offscreen))) == nil && *offscreen != 0 {
		return Element{}, false
	}
	if comCall(element, elemCachedBoundingRect, uintptr(unsafe.Pointer(bounds))) != nil || bounds.rect().empty() {
		return Element{}, false
	}
	comCall(element, elemCachedControlType, uintptr(unsafe.Pointer(controlType)))
	comCall(element, elemCachedName, uintptr(unsafe.Pointer(name)))
	comCall(element, elemCachedIsEnabled, uintptr(unsafe.Pointer(enabled)))
	comCall(element, elemCachedHasFocus, uintptr(unsafe.Pointer(focused)))
	comCall(element, elemCachedIsPassword, uintptr(unsafe.Pointer(password)))
	e := Element{Role: roleNames[*controlType], Name: bstr(*name), Enabled: *enabled != 0, Focused: *focused != 0, Password: *password != 0, Bounds: bounds.rect()}
	if e.Role == "" {
		e.Role = "control"
	}
	if quietRoles[e.Role] && e.Name == "" {
		return Element{}, false
	}
	// A password field's value is never read, not even into memory.
	if !e.Password && (e.Role == "edit" || e.Role == "combobox" || e.Role == "spinner" || e.Role == "slider") {
		value := new(variant)
		if comCall(element, elemGetCachedProperty, propValueValue, uintptr(unsafe.Pointer(value))) == nil {
			if value.VT == vtBSTR && value.Value != 0 {
				n, _, _ := procSysStringLen.Call(value.Value)
				e.Value = syscall.UTF16ToString(unsafe.Slice((*uint16)(at(value.Value)), int(min(n, 4*maxValueRunes))))
			}
			procVariantClear.Call(uintptr(unsafe.Pointer(value)))
		}
	}
	return e, true
}
