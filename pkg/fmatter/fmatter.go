package fmatter

import (
	"bytes"
	"io"
	"strings"
	"unicode"

	"gopkg.in/yaml.v2"
)

const (
	formatStandard = "---"
)

// Write combine front matter and content, and returns the
// new bytes.
func Write(frontmatter interface{}, content []byte) ([]byte, error) {
	f, err := yaml.Marshal(frontmatter)
	if err != nil {
		return nil, err
	}
	r := bytes.NewBuffer([]byte{})
	r.WriteString(formatStandard)
	r.WriteRune('\n')
	r.Write(f)
	r.WriteString(formatStandard)
	r.WriteRune('\n')
	r.Write(content)
	r.WriteRune('\n')

	return r.Bytes(), nil
}

// ReadRaw detects and parses data, and returns the front matter and the
// remaining contents. If no front matter is found, the entire
// file contents are returned.
func ReadRaw(data []byte) (front, remaining []byte) {
	if data == nil {
		return nil, nil
	}
	r := bytes.NewBuffer(data)

	// eat away starting whitespace
	ch := ' '
	var err error
	for unicode.IsSpace(ch) {
		ch, _, err = r.ReadRune()
		if err != nil {
			// file is just whitespace
			return []byte{}, []byte{}
		}
	}
	r.UnreadRune()

	// check if first line is ---
	line, err := r.ReadString('\n')
	if err != nil && err != io.EOF {
		return []byte{}, data
	}

	formatStart := formatStandard
	formatEnd := formatStandard

	if strings.TrimSpace(line) != formatStart {
		// no front matter, just content
		return []byte{}, data
	}

	yamlStart := len(data) - r.Len()
	yamlEnd := yamlStart
	contentStart := yamlStart

	for {
		line, err = r.ReadString('\n')
		if err != nil {
			return []byte{}, data
		}

		if strings.TrimSpace(line) == formatEnd {
			contentStart = len(data) - r.Len()
			yamlEnd = contentStart - len(line)
			break
		}
	}

	return data[yamlStart:yamlEnd], data[contentStart:]
}

// Read detects and parses data, and returns the front matter and the
// remaining contents. If no front matter is found, the entire
// file contents are returned.
func Read(data []byte, frontmatter interface{}) []byte {
	front, remaining := ReadRaw(data)
	if len(front) > 0 {
		yaml.Unmarshal(front, frontmatter)
	}
	return remaining
}
