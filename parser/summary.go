package parser

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
)

//var re = regexp.MustCompile(`\[([^\]]+)\]\(([^\s]+)\s+["|']([\s\S]+)["|']\)|\[([^\]]+)\]\(([^\)]+)\)`)
var (
	regexOuter = regexp.MustCompile(`\[([^\]]+)\]\(([^\)]+)\)`)
	regexInner = regexp.MustCompile(`([^'"]+)\s+['"]([^'"]+)['"]|([^'"]+)`)
)

// UnmarshalSummary parse string to page summary slice
func UnmarshalSummary(data string) []*get3w.PageSummary {
	pageSummaries := []*get3w.PageSummary{}

	if data == "" {
		return pageSummaries
	}

	lines := strings.Split(data, "\n")
	var previousSpaceNum int
	var previousParent *get3w.PageSummary

	for _, line := range lines {
		if !strings.HasPrefix(strings.TrimSpace(line), "*") {
			continue
		}
		arrOuter := regexOuter.FindStringSubmatch(line)
		if len(arrOuter) != 3 || arrOuter[0] == "" || arrOuter[1] == "" || arrOuter[2] == "" {
			continue
		}
		arrInner := regexInner.FindStringSubmatch(arrOuter[2])
		if len(arrInner) != 4 || arrInner[0] == "" {
			continue
		}

		name, templateURL, pageURL := arrOuter[1], "", ""
		if arrInner[3] == "" {
			templateURL, pageURL = strings.TrimSpace(arrInner[1]), strings.TrimSpace(arrInner[2])
		} else {
			templateURL = strings.TrimSpace(arrInner[3])
		}
		if pageURL == "" {
			pageURL = getPageURL(name, templateURL)
		}

		if name == "" || templateURL == "" || pageURL == "" {
			continue
		}

		spaceNum := strings.Index(line, "*")
		pageSummary := &get3w.PageSummary{
			Name:        name,
			TemplateURL: templateURL,
			PageURL:     pageURL,
		}

		var parent *get3w.PageSummary
		if previousSpaceNum == spaceNum {
			parent = previousParent
		} else {
			parent = getParentPageSummary(spaceNum, pageSummaries)
		}

		if parent == nil {
			pageSummaries = append(pageSummaries, pageSummary)
		} else {
			parent.Children = append(parent.Children, pageSummary)
		}

		previousSpaceNum = spaceNum
		previousParent = parent
	}

	return pageSummaries
}

func getPageURL(name, templateURL string) string {
	pageURL := name + ExtHTML
	ext := GetExt(templateURL)
	if ext == ExtYML {
		pageURL = strings.Replace(templateURL, ExtYML, ExtHTML, 1)
	} else if ext == ExtMD {
		pageURL = strings.Replace(templateURL, ExtMD, ExtHTML, 1)
	} else if ext == ExtHTML {
		pageURL = templateURL
	}
	return pageURL
}

func getParentPageSummary(spaceNum int, pageSummaries []*get3w.PageSummary) *get3w.PageSummary {
	if spaceNum == 0 || len(pageSummaries) == 0 {
		return nil
	}
	summary := pageSummaries[len(pageSummaries)-1]
	for i := 0; i < spaceNum; i++ {
		if len(summary.Children) == 0 {
			break
		}
		summary = summary.Children[len(summary.Children)-1]
	}
	return summary
}

// MarshalSummary parse page summary slice to string
func MarshalSummary(pageSummaries []*get3w.PageSummary) string {
	lines := []string{}
	lines = append(lines, "# Summary")
	lines = append(lines, "")

	lines = append(lines, getPageSummaryString(0, pageSummaries))

	retval := ""
	for _, line := range lines {
		retval += line + "\n"
	}
	return retval + "\n"
}

func getPageSummaryString(level int, pageSummaries []*get3w.PageSummary) string {
	retval := ""
	for _, summary := range pageSummaries {
		prefix := ""
		for i := 0; i < level; i++ {
			prefix += "\t"
		}
		if summary.PageURL == getPageURL(summary.Name, summary.TemplateURL) {
			retval += prefix + fmt.Sprintf("* [%s](%s)\n", summary.Name, summary.TemplateURL)
		} else {
			retval += prefix + fmt.Sprintf(`* [%s](%s "%s")\n`, summary.Name, summary.TemplateURL, summary.PageURL)
		}

		if len(summary.Children) > 0 {
			retval += getPageSummaryString(level+1, summary.Children)
		}
	}
	return retval
}
