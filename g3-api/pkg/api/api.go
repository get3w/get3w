package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/labstack/echo"
)

// StaticProxy response proxy.html content
func StaticProxy(c *echo.Context) error {
	return c.HTML(http.StatusOK, StaticProxyContent)
}

// StaticXDomain response xdomain.min.js content
func StaticXDomain(c *echo.Context) error {
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

// StoreHeaders get header values and set to context
func StoreHeaders() echo.HandlerFunc {
	return func(c *echo.Context) error {
		request := c.Request()

		// Skip WebSocket
		if (request.Header.Get(echo.Upgrade)) == echo.WebSocket {
			return nil
		}

		//application/vnd.get3w.v3+json
		version := VersionV1
		accept := request.Header.Get("Accept")
		if accept == "" || accept == "application/vnd.get3w.v1+json" {
			version = VersionV1
		}
		c.Set("version", version)

		auth := request.Header.Get("Authorization")
		l := len(Bearer)
		accessToken := ""

		if len(auth) > l+1 && auth[:l] == Bearer {
			accessToken = auth[l+1:]
		} else if len(request.Header.Get(TokenNameOfHeader)) > 0 {
			accessToken = request.Header.Get(TokenNameOfHeader)
		} else if len(request.URL.Query().Get(TokenNameOfQuery)) > 0 {
			accessToken = request.URL.Query().Get(TokenNameOfQuery)
		}

		c.Set("AccessToken", accessToken)
		return nil
	}
}

// LoadRequestInput decode request body and add value to request
func LoadRequestInput(c *echo.Context, v interface{}) error {
	decoder := json.NewDecoder(c.Request().Body)
	return decoder.Decode(&v)
}

// Version return accept version from reuqest header
func Version(c *echo.Context) string {
	version := c.Get("version")
	if version != nil {
		return version.(string)
	}
	return VersionV1
}

// ErrorBadRequest response bad request specified error message
func ErrorBadRequest(c *echo.Context, err error) error {
	return Error(c, http.StatusBadRequest, err)
}

// ErrorInternal response internal server error with err information
func ErrorInternal(c *echo.Context, err error) error {
	return Error(c, http.StatusInternalServerError, nil)
}

// ErrorNotFound response not found error with err information
func ErrorNotFound(c *echo.Context, err error) error {
	return Error(c, http.StatusNotFound, err)
}

// ErrorUnauthorized response unauthorized error with err information
func ErrorUnauthorized(c *echo.Context, err error) error {
	return Error(c, http.StatusUnauthorized, err)
}

// Error response default error by status code
func Error(c *echo.Context, status int, err error) error {
	message := ""
	if err != nil {
		message = err.Error()
	}
	if message == "" {
		message = http.StatusText(status)
	}
	return c.JSON(status, get3w.ErrorResponse{Message: message, Status: status})
}
