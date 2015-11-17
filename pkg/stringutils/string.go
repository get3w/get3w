// Package stringutils provides helper functions for dealing with strings.
package stringutils

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/asaskevich/govalidator"
	"github.com/satori/go.uuid"
)

// IsUsername return true if str is username
func IsUsername(str string) bool {
	r, _ := regexp.Compile(`^[A-Za-z0-9.\\-_]+$`)
	return r.MatchString(str)
}

// IsEmail return true if str is email
func IsEmail(str string) bool {
	return govalidator.IsEmail(str)
}

// UUID return new uuid
func UUID() string {
	return uuid.NewV4().String()
}

// IsUUID return true if str is uuid
func IsUUID(str string) bool {
	if len(str) == 36 && strings.Count(str, "-") == 4 {
		return true
	}
	return false
}

// Contains return true if slice contains str
func Contains(strlist []string, str string) bool {
	for _, a := range strlist {
		if a == str {
			return true
		}
	}
	return false
}

// ToTime convert the string to a time
func ToTime(str string) time.Time {
	t, err := time.Parse(time.RFC3339, str)
	if err != nil {
		return time.Now()
	}
	return t
}

// TimeToString convert the time to a string
func TimeToString(t *time.Time) string {
	if t != nil {
		return t.Format(time.RFC3339)
	}
	return time.Now().Format(time.RFC3339)
}

// ToString convert the input to a string.
func ToString(obj interface{}) string {
	res := fmt.Sprintf("%v", obj)
	return string(res)
}

// ToJSON convert the input to a valid JSON string
func ToJSON(obj interface{}) (string, error) {
	res, err := json.Marshal(obj)
	if err != nil {
		res = []byte("")
	}
	return string(res), err
}

// ToFloat convert the input string to a float, or 0.0 if the input is not a float.
func ToFloat(str string) (float64, error) {
	res, err := strconv.ParseFloat(str, 64)
	if err != nil {
		res = 0.0
	}
	return res, err
}

// ToInt convert the input string to an integer, or 0 if the input is not an integer.
func ToInt(str string) (int64, error) {
	res, err := strconv.ParseInt(str, 0, 64)
	if err != nil {
		res = 0
	}
	return res, err
}

// ToBoolean convert the input string to a boolean.
func ToBoolean(str string) (bool, error) {
	res, err := strconv.ParseBool(str)
	if err != nil {
		res = false
	}
	return res, err
}

// Base64Encode base64 encode string
func Base64Encode(str string) string {
	data := []byte(str)
	return base64.StdEncoding.EncodeToString(data)
}

// Base64Decode base64 decode string
func Base64Decode(str string) string {
	data, err := base64.StdEncoding.DecodeString(str)
	if err != nil {
		return ""
	}
	return string(data[:])
}

// Base64ForURLEncode encode string from url base64
func Base64ForURLEncode(unencodedText string) string {
	s := Base64Encode(unencodedText)

	arr := strings.Split(s, "=")
	s = arr[0]                           // Remove any trailing '='s
	s = strings.Replace(s, "+", "-", -1) // 62nd char of encoding
	s = strings.Replace(s, "/", "_", -1) // 63rd char of encoding

	return s
}

// Base64ForURLDecode decode string to url base64
func Base64ForURLDecode(str string) string {
	s := str
	s = strings.Replace(s, "-", "+", -1) // 62nd char of encoding
	s = strings.Replace(s, "_", "/", -1) // 63rd char of encoding

	switch len(s) % 4 { // Pad with trailing '='s
	case 0:
		break // No pad chars in this case
	case 2:
		s += "=="
		break // Two pad chars
	case 3:
		s += "="
		break // One pad char
	}

	return Base64Decode(s)
}

// Marshal obj to string
func Marshal(obj interface{}) (string, error) {
	b, err := json.Marshal(obj)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// Unmarshal string to obj
func Unmarshal(str string, obj interface{}) error {
	return json.Unmarshal([]byte(str), &obj)
}

// ReaderToBytes reader to bytes
func ReaderToBytes(stream io.Reader) []byte {
	buf := new(bytes.Buffer)
	buf.ReadFrom(stream)
	return buf.Bytes()
}

// ReaderToString reader to string
func ReaderToString(stream io.Reader) string {
	buf := new(bytes.Buffer)
	buf.ReadFrom(stream)
	return buf.String()
}
