package api

import (
	"fmt"
	"mime"
	"strconv"
	"strings"

	"github.com/Sirupsen/logrus"
	"github.com/get3w/get3w/pkg/version"
)

// Common constants for daemon and client.
const (
	// Version of Current REST API
	Version version.Version = "1"

	// MinVersion represents Minimun REST API version supported
	MinVersion version.Version = "1.12"

	// DefaultDockerfileName is the Default filename with Docker commands, read by docker build
	DefaultDockerfileName string = "Dockerfile"

	DefaultConfigName string = "config.yml"
)

func formGroup(key string, start, last int) string {
	parts := strings.Split(key, "/")
	groupType := parts[0]
	var ip string
	if len(parts) > 1 {
		ip = parts[0]
		groupType = parts[1]
	}
	group := strconv.Itoa(start)
	if start != last {
		group = fmt.Sprintf("%s-%d", group, last)
	}
	if ip != "" {
		group = fmt.Sprintf("%s:%s->%s", ip, group, group)
	}
	return fmt.Sprintf("%s/%s", group, groupType)
}

// MatchesContentType validates the content type against the expected one
func MatchesContentType(contentType, expectedType string) bool {
	mimetype, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		logrus.Errorf("Error parsing media type: %s error: %v", contentType, err)
	}
	return err == nil && mimetype == expectedType
}
