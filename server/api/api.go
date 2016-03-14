package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/home"
	"github.com/labstack/echo"
)

// StaticProxy response proxy.html content
func StaticProxy() echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.HTML(http.StatusOK, StaticProxyContent)
	}
}

// StaticXDomain response xdomain.min.js content
func StaticXDomain() echo.HandlerFunc {
	return func(c echo.Context) error {
		buf := new(bytes.Buffer)
		_, err := fmt.Fprintf(buf, StaticXDomainContent)
		if err != nil {
			return err
		}
		c.Response().Header().Set(echo.ContentType, echo.ApplicationJavaScriptCharsetUTF8)
		c.Response().WriteHeader(http.StatusOK)
		c.Response().Write(buf.Bytes())
		return nil
	}
}

// GetApp returns app by path
func GetApp(path string) (*get3w.App, error) {
	config, err := home.LoadConfig()
	if err != nil {
		return nil, err
	}
	var app *get3w.App
	for _, localApp := range config.Apps {
		if localApp.Path == path {
			app = localApp
		}
	}
	return app, nil
}

// IsAnonymous return true if no authentication information in the header
func IsAnonymous(c echo.Context) bool {
	accessToken := c.Get("AccessToken").(string)
	if accessToken == "" {
		return true
	}
	config, err := home.LoadConfig()
	if err != nil {
		return true
	}
	if config.AuthConfig.AccessToken != accessToken {
		return true
	}
	return false
}

type (
	// StoreHeaderOptions s
	StoreHeaderOptions struct {
	}
)

// StoreHeaders get header values and set to context
func StoreHeaders(options ...*StoreHeaderOptions) echo.MiddlewareFunc {
	return func(next echo.Handler) echo.Handler {
		return echo.HandlerFunc(func(c echo.Context) error {
			request := c.Request()
			header := request.Header()
			url := request.URL()

			//application/vnd.get3w.v3+json
			version := VersionV1
			accept := header.Get("Accept")
			if accept == "" || accept == "application/vnd.get3w.v1+json" {
				version = VersionV1
			}
			c.Set("Version", version)

			auth := header.Get("Authorization")
			l := len(Bearer)
			accessToken := ""

			if len(auth) > l+1 && auth[:l] == Bearer {
				accessToken = auth[l+1:]
			} else if len(header.Get(TokenNameOfHeader)) > 0 {
				accessToken = header.Get(TokenNameOfHeader)
			} else if len(url.QueryValue(TokenNameOfQuery)) > 0 {
				accessToken = url.QueryValue(TokenNameOfQuery)
			}

			c.Set("AccessToken", accessToken)

			config, _ := home.LoadConfig()
			c.Set("Config", config)

			return nil
		})
	}
}

// LoadRequestInput decode request body and add value to request
func LoadRequestInput(c echo.Context, v interface{}) error {
	decoder := json.NewDecoder(c.Request().Body())
	return decoder.Decode(&v)
}

// Config returns home.Config
func Config(c echo.Context) *home.Config {
	config := c.Get("Config")
	if config != nil {
		return config.(*home.Config)
	}
	load, _ := home.LoadConfig()
	return load
}

// Owner get owner by authentication
func Owner(c echo.Context) string {
	config := Config(c)
	return config.AuthConfig.Username
}

// Version return accept version from reuqest header
func Version(c echo.Context) string {
	version := c.Get("Version")
	if version != nil {
		return version.(string)
	}
	return VersionV1
}

// ErrorBadRequest response bad request specified error message
func ErrorBadRequest(c echo.Context, err error) error {
	return Error(c, http.StatusBadRequest, err)
}

// ErrorInternal response internal server error with err information
func ErrorInternal(c echo.Context, err error) error {
	return Error(c, http.StatusInternalServerError, err)
}

// ErrorNotFound response not found error with err information
func ErrorNotFound(c echo.Context, err error) error {
	return Error(c, http.StatusNotFound, err)
}

// ErrorUnauthorized response unauthorized error with err information
func ErrorUnauthorized(c echo.Context, err error) error {
	return Error(c, http.StatusUnauthorized, err)
}

// Error response default error by status code
func Error(c echo.Context, status int, err error) error {
	message := ""
	if err != nil {
		message = err.Error()
	}
	if message == "" {
		message = http.StatusText(status)
	}
	return c.JSON(status, get3w.ErrorResponse{Message: message, Status: status})
}
