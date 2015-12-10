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

// Read detects and parses the front matter data, and returns the
// remaining contents. If no front matter is found, the entire
// file contents are returned. For details on the frontmatter
// parameter, please see the gopkg.in/yaml.v2 package.
func Read(data []byte, frontmatter interface{}) []byte {
	r := bytes.NewBuffer(data)

	// eat away starting whitespace
	ch := ' '
	var err error
	for unicode.IsSpace(ch) {
		ch, _, err = r.ReadRune()
		if err != nil {
			// file is just whitespace
			return []byte{}
		}
	}
	r.UnreadRune()

	// check if first line is ---
	line, err := r.ReadString('\n')
	if err != nil && err != io.EOF {
		return data
	}

	formatStart := formatStandard
	formatEnd := formatStandard

	if strings.TrimSpace(line) != formatStart {
		// no front matter, just content
		return data
	}

	yamlStart := len(data) - r.Len()
	yamlEnd := yamlStart
	contentStart := yamlStart

	for {
		line, err = r.ReadString('\n')
		if err != nil {
			return data
		}

		if strings.TrimSpace(line) == formatEnd {
			contentStart = len(data) - r.Len()
			yamlEnd = contentStart - len(line)
			break
		}
	}

	err = yaml.Unmarshal(data[yamlStart:yamlEnd], frontmatter)
	if err != nil {
		return data
	}

	return data[contentStart:]
}
